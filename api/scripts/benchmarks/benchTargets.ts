import { isRecord, parseJsonAsUnknown, readStringField } from './benchUtils'

export interface BenchTargetDefinition {
  name: 'payload' | 'strapi'
  label: string
  baseUrl: string
  runtime: string
  listUrl: (pageSize: number, populated: boolean) => string
  findByIdUrl: (id: string) => string
  updateUrl: (id: string) => string
  deleteUrl: (id: string) => string
  createUrl: string
  updateMethod: 'PATCH' | 'PUT'
  idField: 'id' | 'documentId'
}

export const payloadTarget: BenchTargetDefinition = {
  name: 'payload',
  label: 'Payload 3.91 on Bun',
  baseUrl: process.env.PAYLOAD_BENCH_URL ?? 'http://127.0.0.1:3100',
  runtime: 'bun',
  listUrl: (pageSize, populated) =>
    `/api/posts?limit=${pageSize}&page=1&depth=${populated ? 1 : 0}`,
  findByIdUrl: (id) => `/api/posts/${id}`,
  updateUrl: (id) => `/api/posts/${id}`,
  deleteUrl: (id) => `/api/posts/${id}`,
  createUrl: '/api/posts',
  updateMethod: 'PATCH',
  idField: 'id',
}

export const strapiTarget: BenchTargetDefinition = {
  name: 'strapi',
  label: 'Strapi 5.58 on Node 22',
  baseUrl: process.env.STRAPI_BENCH_URL ?? 'http://127.0.0.1:1337',
  runtime: 'node',
  listUrl: (pageSize, populated) =>
    `/api/posts?pagination[pageSize]=${pageSize}&pagination[page]=1${populated ? '&populate=*' : ''}`,
  findByIdUrl: (id) => `/api/posts/${id}`,
  updateUrl: (id) => `/api/posts/${id}`,
  deleteUrl: (id) => `/api/posts/${id}`,
  createUrl: '/api/posts',
  updateMethod: 'PUT',
  idField: 'documentId',
}

export const benchTargets: BenchTargetDefinition[] = [payloadTarget, strapiTarget]

// NOTE: Identical lexical-shaped rich text used for both CMSs so response bytes stay comparable.
export const benchContentValue = 'Bench body content for post 1.'

export const benchTitlePrefix = 'Bench write doc'

export const buildPostBody = (index: number): Record<string, unknown> => ({
  title: `${benchTitlePrefix} ${index}`,
  slug: `bench-write-${index}`,
  status: 'published',
  publishedAt: new Date().toISOString(),
  content: benchContentValue,
})

export const loginPayloadForBenchToken = async (
  baseUrl: string,
): Promise<{ token: string; userId: string }> => {
  const response = await fetch(`${baseUrl}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
  })

  if (!response.ok) {
    throw new Error(`Payload login failed: ${response.status} ${await response.text()}`)
  }

  const parsed = (await response.json()) as { token: string; user: { id: string } }

  return { token: parsed.token, userId: parsed.user.id }
}

export const discoverFirstDocumentId = async (target: BenchTargetDefinition): Promise<string> => {
  const response = await fetch(`${target.baseUrl}${target.listUrl(1, false)}`)
  const parsed = await parseJsonAsUnknown(response)
  const id = readFirstDocumentIdentifier(parsed)

  if (!id) {
    throw new Error(`Could not discover a document id for ${target.name}`)
  }

  return id
}

const readFirstDocumentIdentifier = (parsed: unknown): string | null => {
  if (!isRecord(parsed)) {
    return null
  }

  const collection = readCollectionFromEnvelope(parsed)
  const first = collection[0]

  return first ? (readStringField(first, 'documentId') ?? readStringField(first, 'id')) : null
}

// NOTE: Payload returns { docs: [...] } while Strapi returns { data: [...] }.
const readCollectionFromEnvelope = (
  parsed: Record<string, unknown>,
): Array<Record<string, unknown>> => {
  const candidates = [parsed.docs, parsed.data, parsed.data === undefined ? parsed.docs : undefined]
  const collection = candidates.find((candidate) => Array.isArray(candidate))

  return Array.isArray(collection) ? collection.filter(isRecord) : []
}
