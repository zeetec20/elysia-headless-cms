// Domain and entity types derived from the OpenAPI specification schema.d.ts.
import type { components, operations } from '@/api/schema'

export type PayloadUser = components['schemas']['User']
export type PayloadPost = components['schemas']['Post']

export type PayloadPostStatus = NonNullable<PayloadPost['status']>

export type PayloadPostsStats = NonNullable<
  operations['getPostsStats']['responses'][200]['content']['application/json']['data']
>

export interface PayloadListResponse<TItem> {
  docs: TItem[]
  totalDocs: number
  page: number
  limit: number
  totalPages: number
  hasPrevPage?: boolean
  hasNextPage?: boolean
  prevPage?: number | null
  nextPage?: number | null
}

/** Shape of a serialized lexical editor state passed through the Payload richText field. */
export interface LexicalSerializedState {
  root: Record<string, unknown>
}
