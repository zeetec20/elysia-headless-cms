import {
  type BenchTargetDefinition,
  benchTargets,
  discoverFirstDocumentId,
  loginPayloadForBenchToken,
} from './benchTargets'
import {
  type AutocannonSummary,
  type BenchRow,
  formatBenchTable,
  medianOf,
  runAutocannon,
  runBenchSequentially,
} from './benchUtils'

interface SteadyStateScenario {
  key: string
  requiresAuth: boolean
  buildUrl: (target: BenchTargetDefinition, documentId: string) => string
}

const connectionCount = Number(process.env.BENCH_CONNECTIONS ?? 50)
const durationSeconds = Number(process.env.BENCH_DURATION ?? 20)
const warmupSeconds = Number(process.env.BENCH_WARMUP ?? 5)
const repeatCount = Number(process.env.BENCH_REPEATS ?? 3)
const resultsDirectory = '.omo/bench'

const steadyStateScenarios: SteadyStateScenario[] = [
  { key: 'list_10', requiresAuth: false, buildUrl: (target) => target.listUrl(10, false) },
  { key: 'list_10_populated', requiresAuth: false, buildUrl: (target) => target.listUrl(10, true) },
  { key: 'list_100', requiresAuth: false, buildUrl: (target) => target.listUrl(100, false) },
  {
    key: 'find_by_id',
    requiresAuth: false,
    buildUrl: (target, documentId) => target.findByIdUrl(documentId),
  },
]

const payloadOnlyScenarios: SteadyStateScenario[] = [
  { key: 'stats_drizzle', requiresAuth: true, buildUrl: () => '/api/posts/stats' },
]

const medianAutocannonSummary = (summaries: AutocannonSummary[]): AutocannonSummary => ({
  rps: medianOf(summaries.map((summary) => summary.rps)),
  p50: medianOf(summaries.map((summary) => summary.p50)),
  p90: medianOf(summaries.map((summary) => summary.p90)),
  p97_5: medianOf(summaries.map((summary) => summary.p97_5)),
  p99: medianOf(summaries.map((summary) => summary.p99)),
  non2xx: medianOf(summaries.map((summary) => summary.non2xx)),
  errors: medianOf(summaries.map((summary) => summary.errors)),
  avgBytes: medianOf(summaries.map((summary) => summary.avgBytes)),
})

const runSteadyStateScenario = async (args: {
  target: BenchTargetDefinition
  scenario: SteadyStateScenario
  documentId: string
  token: string
}): Promise<BenchRow> => {
  const { target, scenario, documentId, token } = args
  const url = `${target.baseUrl}${scenario.buildUrl(target, documentId)}`
  const headers: Record<string, string> = scenario.requiresAuth
    ? { Authorization: `Bearer ${token}` }
    : {}

  await runAutocannon({ url, connections: 10, durationSec: warmupSeconds, headers })

  const repeatIndexes = Array.from({ length: repeatCount }, (_, index) => index)
  const summaries = await runBenchSequentially(repeatIndexes, () =>
    runAutocannon({ url, connections: connectionCount, durationSec: durationSeconds, headers }),
  )
  const median = medianAutocannonSummary(summaries)

  return {
    suite: 'steady-state',
    target: target.name,
    endpoint: scenario.key,
    connections: connectionCount,
    durationSec: durationSeconds,
    ...median,
  }
}

const run = async (): Promise<void> => {
  const selectedTargets = process.env.BENCH_TARGET
    ? benchTargets.filter((target) => target.name === process.env.BENCH_TARGET)
    : benchTargets

  const payloadTarget = selectedTargets.find((target) => target.name === 'payload')
  const payloadToken = payloadTarget
    ? (await loginPayloadForBenchToken(payloadTarget.baseUrl)).token
    : ''

  const documentIdsEntries = await Promise.all(
    selectedTargets.map(async (target) => [target.name, await discoverFirstDocumentId(target)]),
  )
  const documentIds = Object.fromEntries(documentIdsEntries)

  const sharedRows = await runBenchSequentially(
    selectedTargets.flatMap((target) =>
      steadyStateScenarios.map((scenario) => ({ target, scenario })),
    ),
    ({ target, scenario }) =>
      runSteadyStateScenario({
        target,
        scenario,
        documentId: documentIds[target.name],
        token: payloadToken,
      }),
  )

  const payloadOnlyRows = payloadTarget
    ? await runBenchSequentially(payloadOnlyScenarios, (scenario) =>
        runSteadyStateScenario({
          target: payloadTarget,
          scenario,
          documentId: documentIds.payload,
          token: payloadToken,
        }),
      )
    : []

  const rows = [...sharedRows, ...payloadOnlyRows]
  const table = formatBenchTable(rows)

  await Bun.write(`${resultsDirectory}/steady-state.json`, `${JSON.stringify(rows, null, 2)}\n`)
  await Bun.write(`${resultsDirectory}/steady-state.md`, `\`\`\`\n${table}\n\`\`\`\n`)

  console.log(table)
  console.log(`\nSaved to ${resultsDirectory}/steady-state.json`)
}

await run()
