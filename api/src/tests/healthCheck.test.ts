import { describe, expect, it } from 'bun:test'
import type { PayloadRequest } from 'payload'
import {
  createHealthCheckOpenApiDocumentation,
  handleGetHealthCheckEndpoint,
} from '@/handlers/healthCheckHandler'

describe('Healthcheck Endpoint', () => {
  it('generates valid OpenAPI documentation for health check', () => {
    const doc = createHealthCheckOpenApiDocumentation()
    expect(doc.summary).toBe('Check system health')
    expect(doc.tags).toEqual(['system'])
    expect(doc.security).toEqual([])
    expect(doc.responses?.[200]).toBeDefined()
  })

  it('returns 200 with status healthy and database connected on successful DB probe', async () => {
    let queryExecuted = false
    const mockRequest = {
      payload: {
        db: {
          drizzle: {
            execute: async () => {
              queryExecuted = true
              return [{ '?column?': 1 }]
            },
          },
        },
      },
    } as unknown as PayloadRequest

    const response = await handleGetHealthCheckEndpoint(mockRequest)
    expect(queryExecuted).toBe(true)
    expect(response.status).toBe(200)

    const json = (await response.json()) as {
      success: boolean
      data: {
        status: string
        uptime: number
        database: string
        timestamp: string
      }
    }
    expect(json.success).toBe(true)
    expect(json.data.status).toBe('healthy')
    expect(json.data.database).toBe('connected')
    expect(typeof json.data.uptime).toBe('number')
    expect(typeof json.data.timestamp).toBe('string')
  })

  it('returns 503 when database execution fails', async () => {
    const mockRequest = {
      payload: {
        logger: {
          error: () => {},
        },
        db: {
          drizzle: {
            execute: async () => {
              throw new Error('Connection refused')
            },
          },
        },
      },
    } as unknown as PayloadRequest

    const response = await handleGetHealthCheckEndpoint(mockRequest)
    expect(response.status).toBe(503)

    const json = (await response.json()) as { success: boolean; error: string }
    expect(json.success).toBe(false)
    expect(json.error).toBe('Database connection unhealthy')
  })
})
