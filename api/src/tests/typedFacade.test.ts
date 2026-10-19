import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { App } from '@/server'

// NOTE: Cookie-based auth is CSRF-guarded inside extract JWT: synthetic browser-like requests
// must present an allowlisted Origin for POST/PATCH/DELETE so the payload-token cookie applies.
const DASHBOARD_ORIGIN = 'http://localhost:5173'

const runTypedRequest = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const request = new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Origin: DASHBOARD_ORIGIN,
      'Sec-Fetch-Site': 'same-origin',
      ...(init.headers ?? {}),
    },
  })
  return App.handle(request)
}

const readJsonBody = async (response: Response): Promise<Record<string, unknown>> => {
  return (await response.json()) as Record<string, unknown>
}

const extractTokenCookie = (response: Response): string => {
  const setCookieHeader = response.headers.get('set-cookie') ?? ''
  const tokenMatch = /payload-token=([^;]+)/.exec(setCookieHeader)
  if (!tokenMatch) {
    throw new Error('Login response did not set the payload-token cookie')
  }
  return `payload-token=${tokenMatch[1]}`
}

const loginThroughTypedRoute = async (email: string, password: string): Promise<string> => {
  const response = await runTypedRequest('/api/users/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  expect(response.status).toBe(200)
  return extractTokenCookie(response)
}

describe('Typed Elysia facade over the Payload REST engine', () => {
  let superadminCookie = ''
  let guestCookie = ''
  const createdPostIds: string[] = []
  const createdUserIds: string[] = []
  const runSuffix = Date.now().toString(36)
  const guestEmail = `guest-facade-${runSuffix}@example.com`

  beforeAll(async () => {
    superadminCookie = await loginThroughTypedRoute('admin@example.com', 'password123')
  })

  afterAll(async () => {
    await Promise.all([
      ...createdPostIds.map((postId) =>
        runTypedRequest(`/api/posts/${postId}`, {
          method: 'DELETE',
          headers: { Cookie: superadminCookie },
        }),
      ),
      ...createdUserIds.map((userId) =>
        runTypedRequest(`/api/users/${userId}`, {
          method: 'DELETE',
          headers: { Cookie: superadminCookie },
        }),
      ),
    ])
  })

  it('rejects malformed login bodies with 422 before Payload sees the request', async () => {
    const response = await runTypedRequest('/api/users/login', {
      method: 'POST',
      body: JSON.stringify({ email: true, password: 'password123' }),
    })
    expect(response.status).toBe(422)

    const body = await readJsonBody(response)
    expect(body.type).toBe('validation')
  })

  it('login passthrough returns the Payload session and cookie', async () => {
    const response = await runTypedRequest('/api/users/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('payload-token=')

    const body = await readJsonBody(response)
    const user = body.user as Record<string, unknown>
    expect(user.email).toBe('admin@example.com')
  })

  it('me passthrough returns the anonymous null-user contract', async () => {
    const response = await runTypedRequest('/api/users/me')
    expect(response.status).toBe(200)

    const body = await readJsonBody(response)
    expect(body.user).toBeNull()
  })

  it('list passthrough returns the Payload collection response shape', async () => {
    const response = await runTypedRequest('/api/posts?limit=5&page=1&depth=0')
    expect(response.status).toBe(200)

    const body = await readJsonBody(response)
    expect(Array.isArray(body.docs)).toBe(true)
    expect(body.totalDocs).toBeNumber()
  })

  it('stats passthrough gates authentication through the typed route', async () => {
    const anonymous = await runTypedRequest('/api/posts/stats')
    expect(anonymous.status).toBe(401)

    const authenticated = await runTypedRequest('/api/posts/stats', {
      headers: { Cookie: superadminCookie },
    })
    expect(authenticated.status).toBe(200)

    const body = await readJsonBody(authenticated)
    expect(body.success).toBe(true)
  })

  it('mutating passthrough rebuilds the body and keeps Payload access control', async () => {
    const created = await runTypedRequest('/api/posts', {
      method: 'POST',
      body: JSON.stringify({
        title: `Typed facade post ${Date.now().toString(36)}`,
        slug: `typed-facade-post-${Date.now().toString(36)}`,
        status: 'draft',
      }),
      headers: { Cookie: superadminCookie },
    })
    expect(created.status).toBe(201)
    const createdBody = await readJsonBody(created)
    const doc = createdBody.doc as Record<string, unknown>
    const postId = doc.id as string
    expect(postId).toBeString()
    createdPostIds.push(postId)

    const guestRegister = await runTypedRequest('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        email: guestEmail,
        password: 'guestpass123',
        // NOTE: Anonymous registration cannot upsert itself into superadmin — the role is
        // forced back to guest server-side, exactly like the REST suite asserts.
        role: 'superadmin',
      }),
    })
    expect(guestRegister.status).toBe(201)
    const guestRegisterBody = await readJsonBody(guestRegister)
    createdUserIds.push((guestRegisterBody.doc as Record<string, unknown>).id as string)
    // NOTE: Visitors cannot upsert themselves into superadmin on this route even when the
    // request is authenticated; public registration forces guest exactly like the REST suite.
    expect((guestRegisterBody.doc as Record<string, unknown>).role).toBe('guest')

    guestCookie = await loginThroughTypedRoute(guestEmail, 'guestpass123')
    const guestPatch = await runTypedRequest(`/api/posts/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Guest takeover attempt' }),
      headers: { Cookie: guestCookie },
    })
    expect(guestPatch.status).toBe(403)

    const adminPatch = await runTypedRequest(`/api/posts/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Admin rename via facade' }),
      headers: { Cookie: superadminCookie },
    })
    expect(adminPatch.status).toBe(200)
    const patchedBody = await readJsonBody(adminPatch)
    const patchedDoc = patchedBody.doc as Record<string, unknown>
    expect(patchedDoc.title).toBe('Admin rename via facade')
  })

  it('falls through to the Payload catch-all and reports liveness without a database probe', async () => {
    const response = await runTypedRequest('/api/health')
    expect(response.status).toBe(200)

    const body = await readJsonBody(response)
    expect(body.success).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.status).toBe('healthy')
    expect(data.uptime).toBeNumber()
    expect(data.database).toBeUndefined()
  })
})
