import type { PayloadRequest } from 'payload'
import type { CustomEndpointDocumentation } from 'payload-oapi'
import { getPostsAggregatedStatsService } from '../../services/posts'
import { createApiErrorResponse, createApiSuccessResponse } from '../../utils/apiResponseUtils'
import { createStandardEndpointDocumentation } from '../../utils/endpointDocUtils'
import { logError } from '../../utils/payloadLoggerUtils'

export const createPostsStatsOpenApiDocumentation = (
  authenticated = true,
): CustomEndpointDocumentation => {
  return createStandardEndpointDocumentation({
    summary: 'Retrieve post statistics',
    description:
      'Directly queries PostgreSQL using Drizzle ORM to calculate total posts, status counts, and latest post metadata.',
    tags: ['posts'],
    authenticated,
    dataSchema: {
      type: 'object',
      properties: {
        totalPosts: { type: 'integer' },
        byStatus: {
          type: 'object',
          properties: {
            published: { type: 'integer' },
            draft: { type: 'integer' },
          },
        },
        metrics: {
          type: 'object',
          properties: {
            publishedPercentage: { type: 'number' },
          },
        },
        latestPost: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            slug: { type: 'string' },
            status: { type: 'string' },
            publishedAt: { type: 'string', nullable: true },
          },
        },
      },
    },
  })
}

export const postsStatsOpenApiDocumentation: CustomEndpointDocumentation =
  createPostsStatsOpenApiDocumentation(true)

export const handleGetPostsStatsEndpoint = async (req: PayloadRequest): Promise<Response> => {
  try {
    const stats = await getPostsAggregatedStatsService(req.payload)
    return createApiSuccessResponse(stats)
  } catch (error) {
    logError(req, 'Failed to compute post stats', error)
    return createApiErrorResponse('Failed to retrieve post statistics', 500)
  }
}

export const postsStatsPayloadEndpoint = {
  path: '/stats',
  method: 'get' as const,
  authenticated: true,
  custom: {
    openapi: postsStatsOpenApiDocumentation,
  },
  handler: handleGetPostsStatsEndpoint,
}
