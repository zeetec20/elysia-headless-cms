import type { CustomEndpointDocumentation } from 'payload-oapi'
import { OPEN_API_SECURITY_SCHEME_NAME } from '../constants'

export interface StandardEndpointDocumentationOptions {
  summary: string
  description?: string
  dataSchema: Record<string, unknown>
  authenticated?: boolean
  tags?: string[]
}

export const createStandardEndpointDocumentation = (
  options: StandardEndpointDocumentationOptions,
): CustomEndpointDocumentation => {
  const { summary, description, dataSchema, tags, authenticated = false } = options

  const errorResponseSchema = {
    type: 'object' as const,
    properties: {
      success: { type: 'boolean' as const },
      error: { type: 'string' as const },
    },
    required: ['success', 'error'],
  }

  const responses: NonNullable<CustomEndpointDocumentation['responses']> = {
    200: {
      description: 'Successful response',
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            properties: {
              success: { type: 'boolean' as const },
              data: dataSchema,
            },
            required: ['success', 'data'],
          },
        },
      },
    },
    400: {
      description: 'Bad Request',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    500: {
      description: 'Internal Server Error',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  }

  if (authenticated) {
    responses[401] = {
      description: 'Unauthorized - Valid Bearer token required',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    }
  }

  return {
    summary,
    ...(description ? { description } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    security: authenticated ? [{ [OPEN_API_SECURITY_SCHEME_NAME]: [] }] : [],
    responses,
  }
}
