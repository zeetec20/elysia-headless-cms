import { type BenchTargetDefinition, benchTargets, loginPayloadForBenchToken } from './benchTargets'
import {
  type BenchRow,
  fetchJsonStatus,
  formatBenchTable,
  readProcessCpuPercent,
  readProcessRssBytes,
  resolveListeningPid,
  runAutocannon,
  runBenchSequentially,
  toMegabytes,
} from './benchUtils'

interface LadderLevelResult extends BenchRow {
  serverCpuPercent: number
  serverRssMb: number
}

const ladderLevels = (process.env.BENCH_LADDER ?? '10,25,50,100,200,400,800,1200')
  .split(',')
  .map((value) => Number(value.trim()))
const levelDurationSeconds = Number(process.env.BENCH_LADDER_DURATION ?? 20)
const warmupSeconds = Number(process.env.BENCH_WARMUP ?? 5)
const resultsDirectory = '.omo/bench'

const runLadderLevel = async (args: {
  target: BenchTargetDefinition
  serverPid: number
  connections: number
}): Promise<LadderLevelResult> => {
  const { target, serverPid, connections } = args
  const url = `${target.baseUrl}${target.listUrl(10, false)}`

  await runAutocannon({ url, connections: 10, durationSec: warmupSeconds })
  const summary = await runAutocannon({
    url,
    connections,
    durationSec: levelDurationSeconds,
  })

  return {
    suite: 'stress-ladder',
    target: target.name,
    endpoint: 'list_10',
    connections,
    durationSec: levelDurationSeconds,
    ...summary,
    serverCpuPercent: readProcessCpuPercent(serverPid),
    serverRssMb: toMegabytes(readProcessRssBytes(serverPid)),
  }
}

const run = async (): Promise<void> => {
  const token = (await loginPayloadForBenchToken(benchTargets[0].baseUrl)).token
  console.log(`payload auth token acquired: ${token.slice(0, 12)}...`)

  const rows = await runBenchSequentially(benchTargets, async (target) => {
    const serverPid = resolveListeningPid(target.baseUrl)
    console.log(`\n=== ${target.label} (pid ${serverPid}) ===`)

    return runBenchSequentially(ladderLevels, (connections) =>
      runLadderLevel({ target, serverPid, connections }),
    )
  })

  const flatRows = rows.flat()
  const table = formatBenchTable(flatRows)

  await Bun.write(
    `${resultsDirectory}/stress-ladder.json`,
    `${JSON.stringify(flatRows, null, 2)}\n`,
  )
  await Bun.write(`${resultsDirectory}/stress-ladder.md`, `\`\`\`\n${table}\n\`\`\`\n`)

  console.log(table)

  const healthChecks = await Promise.all(
    benchTargets.map(async (target) => {
      const { status } = await fetchJsonStatus(`${target.baseUrl}${target.listUrl(1, false)}`)

      return `${target.name} post-stress single request: ${status}`
    }),
  )

  console.log(healthChecks.join('\n'))
}

await run()
