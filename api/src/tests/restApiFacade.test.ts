import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { App } from '@/server'

// NOTE: Cookie-based auth is CSRF-guarded inside extractJWT: synthetic browser-like requests
// must present an allowlisted Origin for POST/PATCH/DELETE so the payload-token cookie applies.
const DASHBOARD_ORIGIN = 'http://localhost:5173'

const runApiRequest = async (path: string, init: RequestInit = {}): Promise<Response> => {
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

const loginThroughApiRoute = async (email: string, password: string): Promise<string> => {
  const response = await runApiRequest('/api/users/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  expect(response.status).toBe(200)
  return extractTokenCookie(response)
}

describe('Direct REST API engine on Elysia HTTP server', () => {
  let superadminCookie = ''
  let guestCookie = ''
  const createdPostIds: string[] = []
  const createdUserIds: string[] = []
  const runSuffix = Date.now().toString(36)
  const guestEmail = `guest-rest-${runSuffix}@example.com`

  beforeAll(async () => {
    superadminCookie = await loginThroughApiRoute('admin@example.com', 'password123')
  })

  afterAll(async () => {
    await Promise.all([
      ...createdPostIds.map((postId) =>
        runApiRequest(`/api/posts/${postId}`, {
          method: 'DELETE',
          headers: { Cookie: superadminCookie },
        }),
      ),
      ...createdUserIds.map((userId) =>
        runApiRequest(`/api/users/${userId}`, {
          method: 'DELETE',
          headers: { Cookie: superadminCookie },
        }),
      ),
    ])
  })

  it('rejects invalid login credentials with 400 or 401', async () => {
    const response = await runApiRequest('/api/users/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'nonexistent@example.com', password: 'wrongpassword' }),
    })
    expect([400, 401]).toContain(response.status)
  })

  it('login route returns the Payload session and cookie', async () => {
    const response = await runApiRequest('/api/users/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('payload-token=')

    const body = await readJsonBody(response)
    const user = body.user as Record<string, unknown>
    expect(user.email).toBe('admin@example.com')
  })

  it('me route returns the anonymous null-user contract', async () => {
    const response = await runApiRequest('/api/users/me')
    expect(response.status).toBe(200)

    const body = await readJsonBody(response)
    expect(body.user).toBeNull()
  })

  it('me route returns authenticated user when cookie is present', async () => {
    const response = await runApiRequest('/api/users/me', {
      headers: { Cookie: superadminCookie },
    })
    expect(response.status).toBe(200)

    const body = await readJsonBody(response)
    const user = body.user as Record<string, unknown>
    expect(user).toBeDefined()
    expect(user.email).toBe('admin@example.com')
  })

  it('list route returns the Payload collection response shape', async () => {
    const response = await runApiRequest('/api/posts?limit=5&page=1&depth=0')
    expect(response.status).toBe(200)

    const body = await readJsonBody(response)
    expect(Array.isArray(body.docs)).toBe(true)
    expect(body.totalDocs).toBeNumber()
  })

  it('stats route gates authentication through the custom endpoint', async () => {
    const anonymous = await runApiRequest('/api/posts/stats')
    expect(anonymous.status).toBe(401)

    const authenticated = await runApiRequest('/api/posts/stats', {
      headers: { Cookie: superadminCookie },
    })
    expect(authenticated.status).toBe(200)

    const body = await readJsonBody(authenticated)
    expect(body.success).toBe(true)
  })

  it('mutating routes handle creation and update with Payload access control', async () => {
    const created = await runApiRequest('/api/posts', {
      method: 'POST',
      body: JSON.stringify({
        title: `REST facade post ${Date.now().toString(36)}`,
        slug: `rest-facade-post-${Date.now().toString(36)}`,
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

    const guestRegister = await runApiRequest('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        email: guestEmail,
        password: 'guestpass123',
        role: 'superadmin',
      }),
    })
    expect(guestRegister.status).toBe(201)
    const guestRegisterBody = await readJsonBody(guestRegister)
    createdUserIds.push((guestRegisterBody.doc as Record<string, unknown>).id as string)
    expect((guestRegisterBody.doc as Record<string, unknown>).role).toBe('guest')

    guestCookie = await loginThroughApiRoute(guestEmail, 'guestpass123')
    const guestPatch = await runApiRequest(`/api/posts/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Guest takeover attempt' }),
      headers: { Cookie: guestCookie },
    })
    expect(guestPatch.status).toBe(403)

    const adminPatch = await runApiRequest(`/api/posts/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Admin rename via REST' }),
      headers: { Cookie: superadminCookie },
    })
    expect(adminPatch.status).toBe(200)
    const patchedBody = await readJsonBody(adminPatch)
    const patchedDoc = patchedBody.doc as Record<string, unknown>
    expect(patchedDoc.title).toBe('Admin rename via REST')
  })

  it('reports health liveness without a database probe', async () => {
    const response = await runApiRequest('/api/health')
    expect(response.status).toBe(200)

    const body = await readJsonBody(response)
    expect(body.success).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.status).toBe('healthy')
    expect(data.uptime).toBeNumber()
    expect(data.database).toBeUndefined()
  })
})
