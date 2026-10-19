// Types sourced from the api workspace's generated payload-types.ts via the typed Eden facade.

export type { Post as PayloadPost, User as PayloadUser } from 'payload-elysia-api/payload-types'

import type { Post as PayloadPostType } from 'payload-elysia-api/payload-types'

export type PayloadPostStatus = NonNullable<PayloadPostType['status']>

// NOTE: Mirrors PostsStatsResult returned by GET /api/posts/stats ({ success: true, data: {...} }).
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
