import { payloadApi } from '@/api/edenClient'
import type { PayloadPostsStats } from '@/types'

interface PostsStatsApiBody {
  success: boolean
  data?: PayloadPostsStats
}

export const fetchPostsStats = async (): Promise<PayloadPostsStats> => {
  const result = requireStatsBody(await payloadApi.posts.stats.get())
  return result.data as unknown as PayloadPostsStats
}

const requireStatsBody = (result: {
  data: PostsStatsApiBody | null
  error: unknown
  status: number
}): PostsStatsApiBody => {
  if (!result.data) {
    const body = (result.error as { value?: { message?: string } } | null)?.value
    throw new Error(body?.message ?? `Stats request failed (${result.status})`)
  }
  return result.data
}
