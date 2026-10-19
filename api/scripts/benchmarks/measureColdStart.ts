import path from 'node:path'
import { resolveListeningPid, runBenchSequentially, toMegabytes, waitForHttpOk } from './benchUtils'

interface ColdStartSample {
  target: string
  coldStartMs: number
  spawnedMs: number
  rssAfterReadyMb: number
  rssAfterWarmMb: number
}

const resultsDirectory = '.omo/bench'
const apiDir = path.resolve(import.meta.dir, '../..')
const strapiDir = process.env.STRAPI_BENCH_CWD || path.resolve(apiDir, '../../strapi-bench')

const scenarios: Record<
  string,
  { command: string[]; cwd: string; url: string; env: Record<string, string> }
> = {
  payload: {
    command: ['bun', '--conditions=development', 'src/server.ts'],
    cwd: apiDir,
    url: 'http://127.0.0.1:3100/api/posts?limit=1',
    env: {
      DATABASE_URI: 'postgres://postgres@127.0.0.1:5432/bench_payload',
      PORT: '3100',
    },
  },
  strapi: {
    command: ['npm', 'run', 'start'],
    cwd: strapiDir,
    url: 'http://127.0.0.1:1337/api/posts?pagination%5BpageSize%5D=1',
    env: {},
  },
}

const readRss = (pid: number): number => {
  const proc = Bun.spawnSync(['ps', '-o', 'rss=', '-p', String(pid)], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  return Number(proc.stdout.toString().trim() || 0) * 1024
}

// NOTE: Bun auto-loads payloadjs/.env into the harness env; strip payload-only keys so the
// Strapi child process reads its own .env instead of inheriting PORT/DATABASE_* from Payload.
const buildChildEnvironment = (blockedKeys: string[]): Record<string, string> => {
  const entries = Object.entries(process.env).filter(
    ([key, value]) =>
      typeof value === 'string' &&
      !blockedKeys.includes(key) &&
      !key.startsWith('DATABASE') &&
      key !== 'PAYLOAD_SECRET',
  )

  return Object.fromEntries(entries) as Record<string, string>
}

const measureColdStart = async (target: string): Promise<ColdStartSample> => {
  const scenario = scenarios[target]
  if (!scenario) {
    throw new Error(`Unknown cold start target ${target}`)
  }

  const startedAt = performance.now()
  const logPath = `/tmp/coldstart-${target}.log`
  const childEnvironment = buildChildEnvironment(['PORT', 'NEXT_PUBLIC_SERVER_URL'])
  const proc = Bun.spawn(['sh', '-c', `${scenario.command.join(' ')} > ${logPath} 2>&1`], {
    cwd: scenario.cwd,
    stdout: 'ignore',
    stderr: 'ignore',
    env: { ...childEnvironment, NODE_ENV: 'production', ...scenario.env },
  })

  const coldStartMs = await waitForHttpOk(scenario.url, 180000)
  const serverPid = resolveListeningPid(scenario.url)
  const rssAfterReadyMb = toMegabytes(readRss(serverPid))

  const warmIndexes = Array.from({ length: 20 }, (_, index) => index)
  await Promise.all(
    warmIndexes.map(() =>
      fetch(scenario.url)
        .then((response) => response.text())
        .catch(() => ''),
    ),
  )

  const finalPid = resolveListeningPid(scenario.url)
  const rssAfterWarmMb = toMegabytes(readRss(finalPid > 0 ? finalPid : serverPid))
  const spawnedMs = Math.round(performance.now() - startedAt)

  if (finalPid > 0) {
    try {
      process.kill(finalPid, 'SIGKILL')
    } catch {}
  }
  if (serverPid > 0 && serverPid !== finalPid) {
    try {
      process.kill(serverPid, 'SIGKILL')
    } catch {}
  }
  proc.kill()

  // Wait up to 5s for port to be released
  const port = new URL(scenario.url).port
  const checkAttempts = Array.from({ length: 50 }, (_, i) => i)
  await checkAttempts.reduce<Promise<boolean>>(async (prevPromise) => {
    const isReleased = await prevPromise
    if (isReleased) {
      return true
    }
    const check = Bun.spawnSync(['lsof', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    if (!check.stdout.toString().trim()) {
      return true
    }
    await Bun.sleep(100)
    return false
  }, Promise.resolve(false))

  return { target, coldStartMs, spawnedMs, rssAfterReadyMb, rssAfterWarmMb }
}

const iterations = Number(process.env.COLD_START_ITERATIONS ?? 5)

const run = async (): Promise<void> => {
  const requested = (process.env.COLD_START_TARGET ?? 'payload,strapi').split(',')
  const allSamples: ColdStartSample[] = []
  const iterationIndexes = Array.from({ length: iterations }, (_, index) => index)

  await runBenchSequentially(iterationIndexes, async (iterationIndex) => {
    console.log(`\n--- Iteration ${iterationIndex + 1}/${iterations} ---`)
    await runBenchSequentially(requested, async (target) => {
      const sample = await measureColdStart(target)
      console.log(
        `${target} (#${iterationIndex + 1}): ready in ${sample.coldStartMs}ms (spawn: ${sample.spawnedMs}ms) | rss@ready ${sample.rssAfterReadyMb}MB | rss@warm ${sample.rssAfterWarmMb}MB`,
      )
      allSamples.push(sample)
      await Bun.sleep(2000)
    })
  })

  await Bun.write(`${resultsDirectory}/cold-start.json`, `${JSON.stringify(allSamples, null, 2)}\n`)
}

await run()
