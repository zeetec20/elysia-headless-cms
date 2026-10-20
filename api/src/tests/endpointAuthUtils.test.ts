import { describe, expect, it } from 'bun:test'
import type { PayloadRequest } from 'payload'
import { withEndpointAuth } from '@/utils/endpointAuthUtils'

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

  it('rejects unauthenticated requests without re-running payload auth', async () => {
    let handlerCalled = false
    let authCalls = 0
    const dummyHandler = async (_req: PayloadRequest): Promise<Response> => {
      handlerCalled = true
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    const wrapped = withEndpointAuth(dummyHandler)
    const req = {
      user: null,
      headers: new Headers({
        authorization: 'Bearer invalid-token',
      }),
      payload: {
        auth: async () => {
          authCalls += 1
          return { user: null }
        },
      },
    } as unknown as PayloadRequest

    const response = await wrapped(req)
    expect(handlerCalled).toBe(false)
    expect(authCalls).toBe(0)
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="Payload API"')
    const body = await response.json()
    expect(body).toEqual({
      success: false,
      error: 'Unauthorized: Valid Bearer token required',
    })
  })
})
