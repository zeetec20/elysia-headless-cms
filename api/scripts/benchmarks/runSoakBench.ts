import { benchTargets, loginPayloadForBenchToken } from './benchTargets'
import {
  readProcessCpuPercent,
  readProcessRssBytes,
  resolveListeningPid,
  runBenchSequentially,
  toMegabytes,
} from './benchUtils'

interface SoakSample {
  elapsedSec: number
  serverRssMb: number
  serverCpuPercent: number
  dbActiveConnections: number
  dbWaitingConnections: number
}

interface SoakRunResult {
  target: string
  connections: number
  durationSec: number
  samples: SoakSample[]
  rssDriftMb: number
  autocannonLine: string
}

const connectionCount = Number(process.env.SOAK_CONNECTIONS ?? 100)
const soakSeconds = Number(process.env.SOAK_DURATION ?? 300)
const sampleIntervalMs = Number(process.env.SOAK_SAMPLE_INTERVAL_MS ?? 5000)
const resultsDirectory = '.omo/bench'
const benchDatabaseNames: Record<'payload' | 'strapi', string> = {
  payload: 'bench_payload',
  strapi: 'bench_strapi',
}

const readDatabaseConnectionStats = (databaseName: string): { active: number; waiting: number } => {
  const proc = Bun.spawnSync(
    [
      'psql',
      `postgres://postgres@127.0.0.1:5432/${databaseName}`,
      '-tAc',
      "select count(*) filter (where state = 'active'), count(*) filter (where wait_event_type = 'Lock') from pg_stat_activity where datname = current_database()",
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  const parts = proc.stdout.toString().trim().split('|')

  return { active: Number(parts[0] ?? 0), waiting: Number(parts[1] ?? 0) }
}

// NOTE: Recursive sampler instead of a while-loop so no `await` sits inside a loop body.
const sampleUntilExit = async (args: {
  proc: ReturnType<typeof Bun.spawn>
  serverPid: number
  startedAt: number
  samples: SoakSample[]
  databaseName: string
}): Promise<void> => {
  const { proc, serverPid, startedAt, samples, databaseName } = args

  if (proc.exitCode !== null) {
    return
  }

  const dbStats = readDatabaseConnectionStats(databaseName)
  samples.push({
    elapsedSec: Math.round((performance.now() - startedAt) / 1000),
    serverRssMb: toMegabytes(readProcessRssBytes(serverPid)),
    serverCpuPercent: readProcessCpuPercent(serverPid),
    dbActiveConnections: dbStats.active,
    dbWaitingConnections: dbStats.waiting,
  })

  await Bun.sleep(sampleIntervalMs)
  await sampleUntilExit(args)
}

const runSoak = async (targetName: 'payload' | 'strapi'): Promise<SoakRunResult> => {
  const target = benchTargets.find((candidate) => candidate.name === targetName)
  if (!target) {
    throw new Error(`Unknown bench target ${targetName}`)
  }

  await loginPayloadForBenchToken(benchTargets[0].baseUrl)

  const serverPid = resolveListeningPid(target.baseUrl)
  const url = `${target.baseUrl}${target.listUrl(100, false)}`
  const proc = Bun.spawn(
    [
      'bunx',
      'autocannon',
      '-c',
      String(connectionCount),
      '-d',
      String(soakSeconds),
      '-m',
      'GET',
      url,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  )

  const samples: SoakSample[] = []
  const startedAt = performance.now()

  await sampleUntilExit({
    proc,
    serverPid,
    startedAt,
    samples,
    databaseName: benchDatabaseNames[target.name],
  })
  const stdout = await new Response(proc.stdout).text()
  await proc.exited

  const rssValues = samples.map((sample) => sample.serverRssMb)
  const rssDriftMb = rssValues.length > 0 ? rssValues[rssValues.length - 1] - rssValues[0] : 0
  const latencyLine =
    stdout
      .split('\n')
      .filter((line) => line.includes('Latency') || line.includes('Req/Sec'))
      .join(' | ')
      .slice(0, 400) || 'no autocannon output'

  return {
    target: target.name,
    connections: connectionCount,
    durationSec: soakSeconds,
    samples,
    rssDriftMb: Math.round(rssDriftMb * 100) / 100,
    autocannonLine: latencyLine,
  }
}

const run = async (): Promise<void> => {
  const requestedTargets = (process.env.SOAK_TARGETS ?? 'payload,strapi') as string
  const targets = requestedTargets.split(',')
  const results = await runBenchSequentially(targets, async (targetName) => {
    console.log(`\n=== soak: ${targetName} (${connectionCount} conns, ${soakSeconds}s) ===`)
    const result = await runSoak(targetName as 'payload' | 'strapi')
    console.log(
      `${targetName}: rss drift ${result.rssDriftMb} MB over ${result.durationSec}s | ${result.autocannonLine}`,
    )

    return result
  })

  await Bun.write(`${resultsDirectory}/soak.json`, `${JSON.stringify(results, null, 2)}\n`)
  console.log(`Saved to ${resultsDirectory}/soak.json`)
}

await run()
