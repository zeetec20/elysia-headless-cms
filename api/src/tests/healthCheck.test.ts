import { describe, expect, it } from 'bun:test'
import type { PayloadRequest } from 'payload'
import {
  createHealthCheckOpenApiDocumentation,
  handleGetHealthCheckEndpoint,
} from '@/handlers/system'

describe('Healthcheck Endpoint', () => {
  it('generates valid OpenAPI documentation for health check', () => {
    const doc = createHealthCheckOpenApiDocumentation()
    expect(doc.summary).toBe('Check system health')
    expect(doc.tags).toEqual(['system'])
    expect(doc.security).toEqual([])
    expect(doc.responses?.[200]).toBeDefined()
  })

  // NOTE: Liveness stays discovery-cheap by design: no database round-trip runs per probe, so a
  // degraded database must never fail (or slow down) infrastructure health checks.
  it('returns 200 liveness data without touching the database', async () => {
    const mockRequest = {} as unknown as PayloadRequest

    const response = await handleGetHealthCheckEndpoint(mockRequest)
    expect(response.status).toBe(200)

    const json = (await response.json()) as {
      success: boolean
      data: { status: string; uptime: number; database?: unknown; timestamp: string }
    }
    expect(json.success).toBe(true)
    expect(json.data.status).toBe('healthy')
    expect(typeof json.data.uptime).toBe('number')
    expect(typeof json.data.timestamp).toBe('string')
    expect(json.data.database).toBeUndefined()
  })
})
