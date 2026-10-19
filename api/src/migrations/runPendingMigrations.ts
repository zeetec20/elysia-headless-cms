import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Payload } from 'payload'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

type MigrationModule = {
  up?: (args: { payload: Payload }) => Promise<void>
}

const runSingleDatabaseMigration = async (
  file: string,
  batch: number,
  payload: Payload,
): Promise<boolean> => {
  const filePath = path.join(dirname, file)
  const fileUrl = pathToFileURL(filePath).href
  // Exception: Migration files are runtime-discovered from filesystem timestamps and not known at author time.
  const migrationModule = (await import(fileUrl)) as MigrationModule

  if (typeof migrationModule.up !== 'function') {
    return false
  }

  const migrationStartTime = Date.now()
  payload.logger.info(`Migrating: ${file}`)
  await migrationModule.up({ payload })
  const migrationDurationMs = Date.now() - migrationStartTime

  await payload.create({
    collection: 'payload-migrations',
    data: {
      name: file.replace(/\.ts$/, ''),
      batch,
    },
    overrideAccess: true,
  })

  payload.logger.info(`✓ Migrated: ${file} (${migrationDurationMs}ms)`)
  return true
}

export const executePendingDatabaseMigrations = async (payload: Payload): Promise<number> => {
  const startTime = Date.now()
  const entries = await fs.readdir(dirname)
  const migrationFiles = entries
    .filter((file) => /^\d+.*\.ts$/.test(file))
    .sort((a, b) => a.localeCompare(b))

  if (migrationFiles.length === 0) {
    return 0
  }

  const existingMigrations = await payload.find({
    collection: 'payload-migrations',
    where: {
      batch: {
        not_equals: -1,
      },
    },
    limit: 1000,
    pagination: false,
    overrideAccess: true,
  })

  const appliedMigrationNames = new Set<string>()
  let latestBatchNumber = 0

  for (const doc of existingMigrations.docs) {
    if (doc.name) {
      appliedMigrationNames.add(doc.name)
      appliedMigrationNames.add(doc.name.replace(/\.ts$/, ''))
    }
    if (typeof doc.batch === 'number' && doc.batch > latestBatchNumber) {
      latestBatchNumber = doc.batch
    }
  }

  const pendingMigrationFiles = migrationFiles.filter((file) => {
    const migrationKey = file.replace(/\.ts$/, '')
    return !appliedMigrationNames.has(file) && !appliedMigrationNames.has(migrationKey)
  })

  if (pendingMigrationFiles.length === 0) {
    payload.logger.info('• Database migrations up to date')
    return 0
  }

  const nextBatchNumber = latestBatchNumber + 1
  let executedCount = 0

  for (const file of pendingMigrationFiles) {
    // biome-ignore lint/performance/noAwaitInLoops: Database migrations must execute in strict sequential order.
    const executed = await runSingleDatabaseMigration(file, nextBatchNumber, payload)
    if (executed) {
      executedCount += 1
    }
  }

  const totalDurationMs = Date.now() - startTime
  payload.logger.info(
    `✓ Executed ${executedCount} pending migration(s) in batch ${nextBatchNumber} (${totalDurationMs}ms)`,
  )
  return executedCount
}
