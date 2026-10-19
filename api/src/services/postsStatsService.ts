import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { count, desc } from 'drizzle-orm'
import type { BasePayload } from 'payload'

export interface PostsStatsResult {
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

export const getPostsAggregatedStatsService = async (
  payload: BasePayload,
): Promise<PostsStatsResult> => {
  const db = payload.db as unknown as PostgresAdapter
  const drizzle = db.drizzle
  const postsTable = db.tables.posts

  const totalResult = await drizzle.select({ total: count() }).from(postsTable)
  const totalPosts = Number(totalResult[0]?.total ?? 0)

  const statusResult = await drizzle
    .select({ status: postsTable.status, count: count() })
    .from(postsTable)
    .groupBy(postsTable.status)

  const byStatus: Record<string, number> = {
    published: 0,
    draft: 0,
  }
  for (const row of statusResult) {
    if (row.status) {
      byStatus[row.status] = Number(row.count)
    }
  }

  const publishedPercentage =
    totalPosts > 0 ? Math.round(((byStatus.published || 0) / totalPosts) * 100) : 0

  const latestPostRows = await drizzle
    .select({
      id: postsTable.id,
      title: postsTable.title,
      slug: postsTable.slug,
      status: postsTable.status,
      publishedAt: postsTable.publishedAt,
    })
    .from(postsTable)
    .orderBy(desc(postsTable.createdAt))
    .limit(1)

  const latestPost = latestPostRows[0]
    ? {
        id: String(latestPostRows[0].id),
        title: latestPostRows[0].title,
        slug: latestPostRows[0].slug,
        status: latestPostRows[0].status,
        publishedAt: latestPostRows[0].publishedAt
          ? new Date(latestPostRows[0].publishedAt).toISOString()
          : null,
      }
    : null

  return {
    totalPosts,
    byStatus: {
      published: byStatus.published || 0,
      draft: byStatus.draft || 0,
      ...byStatus,
    },
    metrics: {
      publishedPercentage,
    },
    latestPost,
  }
}
