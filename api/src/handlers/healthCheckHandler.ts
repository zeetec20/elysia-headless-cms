import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from 'drizzle-orm'
import type { PayloadRequest } from 'payload'
import type { CustomEndpointDocumentation } from 'payload-oapi'
import { createApiErrorResponse, createApiSuccessResponse } from '@/utils/apiResponseUtils'
import { createStandardEndpointDocumentation } from '@/utils/endpointDocUtils'
import { logEndpointError } from '@/utils/payloadLoggerUtils'

export interface HealthCheckData {
  status: 'healthy'
  uptime: number
  database: 'connected'
  timestamp: string
}

export const createHealthCheckOpenApiDocumentation = (): CustomEndpointDocumentation => {
  return createStandardEndpointDocumentation({
    summary: 'Check system health',
    description: 'Verifies service availability, system uptime, and database connectivity.',
    tags: ['system'],
    authenticated: false,
    dataSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        uptime: { type: 'number', example: 12.34 },
        database: { type: 'string', example: 'connected' },
        timestamp: { type: 'string', format: 'date-time' },
      },
      required: ['status', 'uptime', 'database', 'timestamp'],
    },
  })
}

export const healthCheckOpenApiDocumentation: CustomEndpointDocumentation =
  createHealthCheckOpenApiDocumentation()

export const handleGetHealthCheckEndpoint = async (req: PayloadRequest): Promise<Response> => {
  try {
    const db = req.payload.db as unknown as PostgresAdapter
    if (!db?.drizzle?.execute) {
      throw new Error('Database adapter or drizzle instance is not initialized')
    }
    await db.drizzle.execute(sql`SELECT 1`)

    const data: HealthCheckData = {
      status: 'healthy',
      uptime: process.uptime(),
      database: 'connected',
      timestamp: new Date().toISOString(),
    }

    return createApiSuccessResponse(data, 200)
  } catch (error) {
    logEndpointError(req, 'Healthcheck probe failed', error)
    return createApiErrorResponse('Database connection unhealthy', 503)
  }
}
