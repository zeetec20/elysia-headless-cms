import { describe, expect, it } from 'bun:test'
import type { PayloadRequest } from 'payload'
import { normalizeEndpointRequestHeaders, withEndpointAuth } from '@/utils/endpointAuthUtils'

describe('Endpoint Auth Utils', () => {
  it('passes through when req.user is already populated', async () => {
    let handlerCalled = false
    const dummyHandler = async (_req: PayloadRequest): Promise<Response> => {
      handlerCalled = true
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    const wrapped = withEndpointAuth(dummyHandler)
    const req = {
      user: { id: 'admin-1', email: 'admin@example.com' },
      headers: new Headers(),
    } as unknown as PayloadRequest

    const response = await wrapped(req)
    expect(handlerCalled).toBe(true)
    expect(response.status).toBe(200)
  })

  it('rejects unauthenticated request with 401 when no auth header provided', async () => {
    let handlerCalled = false
    const dummyHandler = async (_req: PayloadRequest): Promise<Response> => {
      handlerCalled = true
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    const wrapped = withEndpointAuth(dummyHandler)
    const req = {
      user: null,
      headers: new Headers(),
    } as unknown as PayloadRequest

    const response = await wrapped(req)
    expect(handlerCalled).toBe(false)
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('ApiKey realm="Payload API"')
    const body = await response.json()
    expect(body).toEqual({
      success: false,
      error: 'Unauthorized: Valid API key required',
    })
  })

  it('rejects invalid bearer token with 401', async () => {
    const dummyHandler = async (_req: PayloadRequest): Promise<Response> => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    const wrapped = withEndpointAuth(dummyHandler)
    const req = {
      user: null,
      headers: new Headers({
        authorization: 'Bearer invalid-token',
      }),
      payload: {
        authenticate: async () => ({ user: null }),
      },
    } as unknown as PayloadRequest

    const response = await wrapped(req)
    expect(response.status).toBe(401)
  })

  it('normalizes raw authorization token without space to users API-Key format', () => {
    const req = {
      headers: new Headers({
        authorization: 'raw-api-key-12345',
      }),
    } as unknown as PayloadRequest

    const headers = normalizeEndpointRequestHeaders(req)
    expect(headers.get('authorization')).toBe('users API-Key raw-api-key-12345')
  })

  it('normalizes x-api-key header when authorization is absent', () => {
    const req = {
      headers: new Headers({
        'x-api-key': 'secret-key-xyz',
      }),
    } as unknown as PayloadRequest

    const headers = normalizeEndpointRequestHeaders(req)
    expect(headers.get('authorization')).toBe('users API-Key secret-key-xyz')
  })

  it('preserves existing scheme prefix in authorization header', () => {
    const req = {
      headers: new Headers({
        authorization: 'Bearer jwt-token-value',
      }),
    } as unknown as PayloadRequest

    const headers = normalizeEndpointRequestHeaders(req)
    expect(headers.get('authorization')).toBe('Bearer jwt-token-value')
  })

  it('normalizes raw JWT token without Bearer prefix to Bearer scheme', () => {
    const rawJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyJ9.signature'
    const req = {
      headers: new Headers({
        authorization: rawJwt,
      }),
    } as unknown as PayloadRequest

    const headers = normalizeEndpointRequestHeaders(req)
    expect(headers.get('authorization')).toBe(`Bearer ${rawJwt}`)
  })

  it('normalizes ApiKey prefix missing users slug prefix', () => {
    const req = {
      headers: new Headers({
        authorization: 'ApiKey my-secret-api-key',
      }),
    } as unknown as PayloadRequest

    const headers = normalizeEndpointRequestHeaders(req)
    expect(headers.get('authorization')).toBe('users API-Key my-secret-api-key')
  })
})
