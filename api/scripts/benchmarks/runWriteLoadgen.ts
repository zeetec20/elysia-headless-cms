import {
  type BenchTargetDefinition,
  benchTargets,
  buildPostBody,
  loginPayloadForBenchToken,
} from './benchTargets'
import {
  isRecord,
  LatencySink,
  type LatencySinkResult,
  parseJsonAsUnknown,
  readStringField,
  runLoadWorkers,
} from './benchUtils'

interface WritePhaseResult extends LatencySinkResult {
  phase: 'create' | 'update' | 'delete'
  target: string
  method: string
}

const docCount = Number(process.env.WRITE_DOC_COUNT ?? 2000)
const concurrency = Number(process.env.WRITE_CONCURRENCY ?? 50)
const resultsDirectory = '.omo/bench'

const resolveTarget = (name: string): BenchTargetDefinition => {
  const target = benchTargets.find((candidate) => candidate.name === name)
  if (!target) {
    throw new Error(`Unknown bench target ${name}`)
  }

  return target
}

const postJson = async (args: {
  url: string
  method: string
  body: unknown
  headers: Record<string, string>
}): Promise<{ status: number; body: unknown }> => {
  const response = await fetch(args.url, {
    method: args.method,
    headers: { 'Content-Type': 'application/json', ...args.headers },
    body: JSON.stringify(args.body),
  })
  const parsed = await parseJsonAsUnknown(response)

  return { status: response.status, body: parsed }
}

// NOTE: Payload wraps created documents in `doc`, Strapi 5 in `data`.
const readCreatedDocument = (responseBody: unknown): Record<string, unknown> | null => {
  if (!isRecord(responseBody)) {
    return null
  }

  const payloadRecord = responseBody.doc
  if (isRecord(payloadRecord)) {
    return payloadRecord
  }

  const strapiRecord = responseBody.data

  return isRecord(strapiRecord) ? strapiRecord : null
}

// NOTE: Payload takes a flat body, Strapi 5 requires the `{ data: ... }` input envelope.
const buildWriteEnvelope = (
  targetName: 'payload' | 'strapi',
  fields: Record<string, unknown>,
): Record<string, unknown> => (targetName === 'strapi' ? { data: fields } : fields)

const runCreatePhase = async (args: {
  target: BenchTargetDefinition
  headers: Record<string, string>
  runId: string
}): Promise<{ result: WritePhaseResult; createdIds: string[] }> => {
  const { target, headers, runId } = args
  const indexes = Array.from({ length: docCount }, (_, index) => index)
  const createdIds: string[] = Array.from({ length: docCount }, () => '')
  const sink = new LatencySink()

  await runLoadWorkers(indexes, concurrency, sink, async (index) => {
    const fields = {
      ...buildPostBody(index),
      slug: `${runId}-${index}`,
      title: `${runId} ${index}`,
    }
    const { status, body: responseBody } = await postJson({
      url: `${target.baseUrl}${target.createUrl}`,
      method: 'POST',
      body: buildWriteEnvelope(target.name, fields),
      headers,
    })
    const created = readCreatedDocument(responseBody)
    createdIds[index] = created ? (readStringField(created, target.idField) ?? '') : ''

    return status
  })

  return {
    result: { phase: 'create', target: target.name, method: 'POST', ...sink.summarize() },
    createdIds: createdIds.filter(Boolean),
  }
}

const runMutationPhase = async (args: {
  target: BenchTargetDefinition
  headers: Record<string, string>
  ids: string[]
  phase: 'update' | 'delete'
}): Promise<WritePhaseResult> => {
  const { target, headers, ids, phase } = args
  const sink = new LatencySink()

  await runLoadWorkers(ids, concurrency, sink, async (id) => {
    if (phase === 'delete') {
      const response = await fetch(`${target.baseUrl}${target.deleteUrl(id)}`, {
        method: 'DELETE',
        headers,
      })

      return response.status
    }

    const { status } = await postJson({
      url: `${target.baseUrl}${target.updateUrl(id)}`,
      method: target.updateMethod,
      body: buildWriteEnvelope(target.name, {
        title: `updated ${id.slice(0, 8)}`,
        status: 'draft',
      }),
      headers,
    })

    return status
  })

  return {
    phase,
    target: target.name,
    method: phase === 'delete' ? 'DELETE' : target.updateMethod,
    ...sink.summarize(),
  }
}

const run = async (): Promise<void> => {
  const targetName = process.env.WRITE_TARGET ?? 'payload'
  const target = resolveTarget(targetName)
  const runId = `bench-${targetName}-${Date.now()}`
  const headers: Record<string, string> = {}

  if (target.name === 'payload') {
    const { token } = await loginPayloadForBenchToken(target.baseUrl)
    headers.Authorization = `Bearer ${token}`
  }

  console.log(`=== write load: ${target.label}, docs=${docCount}, concurrency=${concurrency} ===`)

  const createPhase = await runCreatePhase({ target, headers, runId })
  console.log(`${targetName} create: ${JSON.stringify(createPhase.result)}`)

  const updatePhase = await runMutationPhase({
    target,
    headers,
    ids: createPhase.createdIds,
    phase: 'update',
  })
  console.log(`${targetName} update: ${JSON.stringify(updatePhase)}`)

  const deletePhase = await runMutationPhase({
    target,
    headers,
    ids: createPhase.createdIds,
    phase: 'delete',
  })
  console.log(`${targetName} delete: ${JSON.stringify(deletePhase)}`)

  const payload = {
    target: target.name,
    docCount,
    concurrency,
    results: [createPhase.result, updatePhase, deletePhase],
  }

  await Bun.write(
    `${resultsDirectory}/write-${targetName}.json`,
    `${JSON.stringify(payload, null, 2)}\n`,
  )
}

await run()
