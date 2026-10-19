// Types mirroring the Payload collections defined in api/src/collections and payload-types.ts.

export type PayloadPostStatus = 'draft' | 'published'

export interface PayloadPost {
  id: string
  title: string
  slug: string
  /** Serialized lexical editor state ({ root: ... }) or null when empty. */
  content: unknown | null
  status: PayloadPostStatus
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PayloadUser {
  id: string
  email: string
  role: 'superadmin' | 'guest'
  enableAPIKey?: boolean
  apiKey?: string
  createdAt: string
  updatedAt: string
}

export interface PayloadPostsStats {
  totalPosts: number
  byStatus: {
    published: number
    draft: number
    [status: string]: number
  }
  metrics: {
    publishedPercentage: number
  }
  latestPost: {
    id: string
    title: string
    slug: string
    status: string
    publishedAt: string | null
  } | null
}

/** Shape of a serialized lexical editor state passed through the Payload richText field. */
export interface LexicalSerializedState {
  root: Record<string, unknown>
}
