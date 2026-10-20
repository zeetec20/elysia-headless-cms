export interface LatencySinkResult {
  count: number
  errorCount: number
  rps: number
  p50: number
  p90: number
  p97_5: number
  p99: number
  statusCounts: Record<string, number>
}

export interface AutocannonSummary {
  rps: number
  p50: number
  p90: number
  p97_5: number
  p99: number
  non2xx: number
  errors: number
  avgBytes: number
}

export interface BenchRow {
  suite: string
  target: string
  endpoint: string
  connections: number
  durationSec: number
  rps: number
  p50: number
  p90: number
  p97_5: number
  p99: number
  non2xx: number
  errors: number
  avgBytes: number
}

// NOTE: Sequential helper that keeps `await` out of loop bodies (biome performance.noAwaitInLoops).
export const runBenchSequentially = async <T, R>(
  items: T[],
  task: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = []
  const chain = items.reduce<Promise<void>>(
    (prev, item) =>
      prev.then(async () => {
        results.push(await task(item))
      }),
    Promise.resolve(),
  )

  await chain

  return results
}

export const medianOf = (values: number[]): number => {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]

  return round2(median)
}

export const percentileOf = (sortedValues: number[], percentile: number): number => {
  if (sortedValues.length === 0) {
    return 0
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sortedValues.length) - 1),
  )

  return round2(sortedValues[index])
}

export const round2 = (value: number): number => Math.round(value * 100) / 100

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const readNumberField = (source: Record<string, unknown>, key: string): number => {
  const value = source[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export const readStringField = (source: Record<string, unknown>, key: string): string | null => {
  const value = source[key]

  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  return typeof value === 'number' ? String(value) : null
}

export const parseJsonAsUnknown = async (response: Response): Promise<unknown> => {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return {}
  }
}

export class LatencySink {
  private samples: number[] = []
  private statuses: Record<string, number> = {}
  private errors = 0
  private startedAt = performance.now()

  record = (latencyMs: number, status: number | string): void => {
    this.samples.push(latencyMs)
    const key = String(status)
    this.statuses[key] = (this.statuses[key] ?? 0) + 1
    if (!key.startsWith('2')) {
      this.errors += 1
    }
  }

  summarize = (): LatencySinkResult => {
    const sorted = [...this.samples].sort((a, b) => a - b)
    const elapsedSec = (performance.now() - this.startedAt) / 1000

    return {
      count: this.samples.length,
      errorCount: this.errors,
      rps: round2(this.samples.length / elapsedSec),
      p50: percentileOf(sorted, 50),
      p90: percentileOf(sorted, 90),
      p97_5: percentileOf(sorted, 97.5),
      p99: percentileOf(sorted, 99),
      statusCounts: this.statuses,
    }
  }
}

// NOTE: Open-loop worker pool. Each worker processes its slice serially so per-request latency is measured closed-loop.
export const runLoadWorkers = async <T>(
  tasks: T[],
  concurrency: number,
  sink: LatencySink,
  request: (task: T) => Promise<number | string>,
): Promise<void> => {
  const workerIndexes = Array.from({ length: concurrency }, (_, index) => index)
  const workers = workerIndexes.map((workerIndex) => {
    const slice = tasks.filter((_, taskIndex) => taskIndex % concurrency === workerIndex)

    return slice.reduce<Promise<void>>(
      (prev, task) =>
        prev.then(async () => {
          const startedAt = performance.now()
          try {
            const status = await request(task)
            sink.record(performance.now() - startedAt, status)
          } catch (error) {
            sink.record(performance.now() - startedAt, `ERR:${(error as Error).name}`)
          }
        }),
      Promise.resolve(),
    )
  })

  await Promise.all(workers)
}

export const runAutocannon = async (args: {
  url: string
  connections: number
  durationSec: number
  warmupSec?: number
  method?: string
  headers?: Record<string, string>
  body?: string
}): Promise<AutocannonSummary> => {
  const warmupArgs =
    args.warmupSec && args.warmupSec > 0
      ? ['--warmup', '[', '-c', String(args.connections), '-d', String(args.warmupSec), ']']
      : []

  const command = [
    'bunx',
    'autocannon',
    '--json',
    ...warmupArgs,
    '-c',
    String(args.connections),
    '-d',
    String(args.durationSec),
    '-m',
    args.method ?? 'GET',
  ]

  for (const [key, value] of Object.entries(args.headers ?? {})) {
    command.push('-H', `${key}=${value}`)
  }

  if (args.body) {
    command.push('-b', args.body)
  }

  command.push(args.url)

  const proc = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'pipe' })
  const stdout = proc.stdout.toString().trim()
  const lines = stdout.split('\n')
  const jsonLines = lines.filter((line) => line.startsWith('{'))
  const jsonLine = jsonLines.pop()
  if (!jsonLine) {
    throw new Error(
      `autocannon produced no JSON for ${args.url}: ${proc.stderr.toString().slice(0, 500)}`,
    )
  }

  const parsed: unknown = JSON.parse(jsonLine)
  const root = isRecord(parsed) ? parsed : {}

  return {
    rps: round2(readNumberField(readNestedRecord(root, 'requests'), 'average')),
    p50: round2(readNumberField(readNestedRecord(root, 'latency'), 'p50')),
    p90: round2(readNumberField(readNestedRecord(root, 'latency'), 'p90')),
    p97_5: round2(readNumberField(readNestedRecord(root, 'latency'), 'p97_5')),
    p99: round2(readNumberField(readNestedRecord(root, 'latency'), 'p99')),
    non2xx: readNumberField(root, 'non2xx'),
    errors: readNumberField(root, 'errors'),
    avgBytes: round2(readNumberField(readNestedRecord(root, 'throughput'), 'average')),
  }
}

const readNestedRecord = (
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> => {
  const nested = source[key]

  return isRecord(nested) ? nested : {}
}

export const fetchJsonStatus = async (
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> => {
  const response = await fetch(url, init)
  const text = await response.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }

  return { status: response.status, body }
}

// NOTE: Recursive polling instead of a while-loop so no `await` sits inside a loop body.
export const waitForHttpOk = async (url: string, timeoutMs: number): Promise<number> => {
  const startedAt = performance.now()

  return pollUntilHttpOk({ url, startedAt, deadline: startedAt + timeoutMs })
}

const pollUntilHttpOk = async (args: {
  url: string
  startedAt: number
  deadline: number
}): Promise<number> => {
  const { url, startedAt, deadline } = args
  const probe = await probeHttpOk(url)

  if (probe.ok) {
    return Math.round(performance.now() - startedAt)
  }

  if (performance.now() >= deadline) {
    throw new Error(`Server never became ready at ${url} within ${deadline - startedAt}ms`)
  }

  await Bun.sleep(100)

  return pollUntilHttpOk(args)
}

const probeHttpOk = async (url: string): Promise<{ ok: boolean }> => {
  try {
    const response = await fetch(url)

    return { ok: response.ok }
  } catch {
    return { ok: false }
  }
}

export const readProcessRssBytes = (pid: number): number => {
  const proc = Bun.spawnSync(['ps', '-o', 'rss=', '-p', String(pid)], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const raw = proc.stdout.toString().trim()

  return raw ? Number(raw) * 1024 : 0
}

export const readProcessCpuPercent = (pid: number): number => {
  const proc = Bun.spawnSync(['ps', '-o', '%cpu=', '-p', String(pid)], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const raw = proc.stdout.toString().trim()

  return raw ? Number(raw) : 0
}

export const resolveListeningPid = (baseUrl: string): number => {
  const port = new URL(baseUrl).port
  const proc = Bun.spawnSync(['lsof', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const pids = proc.stdout.toString().trim().split('\n').filter(Boolean)

  return pids.length > 0 ? Number(pids[pids.length - 1]) : 0
}

export const toMegabytes = (bytes: number): number => round2(bytes / 1024 / 1024)

export const formatBenchTable = (rows: BenchRow[]): string => {
  const header = [
    'suite',
    'target',
    'endpoint',
    'conns',
    'rps',
    'p50',
    'p90',
    'p97_5',
    'p99',
    'non2xx',
    'errors',
    'bytes/s',
  ]
  const lines = rows.map((row) =>
    [
      row.suite,
      row.target,
      row.endpoint,
      String(row.connections),
      String(row.rps),
      String(row.p50),
      String(row.p90),
      String(row.p97_5),
      String(row.p99),
      String(row.non2xx),
      String(row.errors),
      String(row.avgBytes),
    ].join(' | '),
  )

  return [header.join(' | '), ...lines].join('\n')
}
