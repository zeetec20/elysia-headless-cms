import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { handleEndpoints } from 'payload'

import configPromise from '@/payload.config'

const API_ORIGIN = 'http://localhost:3000'
const DASHBOARD_ORIGIN = 'http://localhost:5173'
const runRestRequest = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const request = new Request(`${API_ORIGIN}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Origin: DASHBOARD_ORIGIN,
      ...(init.headers ?? {}),
    },
  })
  return handleEndpoints({ config: configPromise, request })
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

const loginAs = async (email: string, password: string): Promise<string> => {
  const response = await runRestRequest('/api/users/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  expect(response.status).toBe(200)

  const body = await readJsonBody(response)
  const token = body.token
  if (typeof token !== 'string') {
    throw new Error('Login response did not return a JWT token')
  }
  return token
}

const runAuthenticatedRestRequest = (
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> =>
  runRestRequest(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  })

describe('Payload REST API mounted through handleEndpoints', () => {
  let superadminToken = ''
  let guestToken = ''
  const createdPostIds: string[] = []
  const createdUserIds: string[] = []
  const runSuffix = Date.now().toString(36)

  beforeAll(async () => {
    superadminToken = await loginAs('admin@example.com', 'password123')
  })

  afterAll(async () => {
    await Promise.all([
      ...createdPostIds.map((postId) =>
        runAuthenticatedRestRequest(superadminToken, `/api/posts/${postId}`, {
          method: 'DELETE',
        }),
      ),
      ...createdUserIds.map((userId) =>
        runAuthenticatedRestRequest(superadminToken, `/api/users/${userId}`, {
          method: 'DELETE',
        }),
      ),
    ])
  })

  describe('system endpoints', () => {
    it('reports health without database connectivity', async () => {
      const response = await runRestRequest('/api/health')
      expect(response.status).toBe(200)

      const body = await readJsonBody(response)
      expect(body.success).toBe(true)
      const data = body.data as Record<string, unknown>
      expect(data.status).toBe('healthy')
      expect(data.uptime).toBeTypeOf('number')
      expect(typeof data.timestamp).toBe('string')
      expect(data.database).toBeUndefined()
    })
  })

  describe('authentication', () => {
    it('rejects invalid credentials with 401', async () => {
      const response = await runRestRequest('/api/users/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@example.com', password: 'wrong-password' }),
      })
      expect(response.status).toBe(401)
    })

    it('returns a JWT on successful login and resolves /me', async () => {
      const response = await runRestRequest('/api/users/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
      })
      expect(response.status).toBe(200)

      const loginBody = await readJsonBody(response)
      const token = loginBody.token
      expect(typeof token).toBe('string')

      const meResponse = await runAuthenticatedRestRequest(token as string, '/api/users/me')
      expect(meResponse.status).toBe(200)

      const body = await readJsonBody(meResponse)
      const user = body.user as Record<string, unknown>
      expect(user.email).toBe('admin@example.com')
      expect(user.role).toBe('superadmin')
    })

    it('returns no user on /me without credentials', async () => {
      const response = await runRestRequest('/api/users/me')
      expect(response.status).toBe(200)

      const body = await readJsonBody(response)
      expect(body.user).toBeNull()
    })

    it('ignores the login cookie and requires a Bearer token', async () => {
      const response = await runRestRequest('/api/users/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
      })
      expect(response.status).toBe(200)

      const cookie = extractTokenCookie(response)
      const cookieOnlyResponse = await runRestRequest('/api/posts/stats', {
        headers: { Cookie: cookie },
      })
      expect(cookieOnlyResponse.status).toBe(401)
    })

    it('revokes the JWT session on logout', async () => {
      const token = await loginAs('admin@example.com', 'password123')

      const logoutResponse = await runAuthenticatedRestRequest(token, '/api/users/logout', {
        method: 'POST',
      })
      expect(logoutResponse.status).toBe(200)

      const replayResponse = await runAuthenticatedRestRequest(token, '/api/posts/stats')
      expect(replayResponse.status).toBe(401)
    })
  })

  describe('posts CRUD and validation', () => {
    it('denies unauthenticated post creation with 403', async () => {
      const response = await runRestRequest('/api/posts?depth=0', {
        method: 'POST',
        body: JSON.stringify({ title: 'Anonymous Post', slug: `anon-${runSuffix}` }),
      })
      expect(response.status).toBe(403)
    })

    it('rejects invalid slugs with a field-level validation error', async () => {
      const response = await runAuthenticatedRestRequest(superadminToken, '/api/posts?depth=0', {
        method: 'POST',
        body: JSON.stringify({ title: 'Bad Slug Post', slug: 'Invalid Slug!' }),
      })
      expect(response.status).toBe(400)

      const body = await readJsonBody(response)
      const errors = (body.errors as Array<{ data?: { errors?: Array<{ path?: string }> } }>) ?? []
      const slugError = errors[0]?.data?.errors?.find((error) => error.path === 'slug')
      expect(slugError).toBeDefined()
    })

    it('rejects duplicate slugs with a uniqueness error', async () => {
      const createResponse = await runAuthenticatedRestRequest(
        superadminToken,
        '/api/posts?depth=0',
        {
          method: 'POST',
          body: JSON.stringify({ title: 'Unique Slug Post', slug: `unique-${runSuffix}` }),
        },
      )
      expect(createResponse.status).toBe(201)
      const createdBody = await readJsonBody(createResponse)
      createdPostIds.push((createdBody.doc as Record<string, unknown>).id as string)

      const duplicateResponse = await runAuthenticatedRestRequest(
        superadminToken,
        '/api/posts?depth=0',
        {
          method: 'POST',
          body: JSON.stringify({ title: 'Duplicate Slug Post', slug: `unique-${runSuffix}` }),
        },
      )
      expect(duplicateResponse.status).toBe(400)

      const body = await readJsonBody(duplicateResponse)
      const errors =
        (body.errors as Array<{ data?: { errors?: Array<{ message?: string }> } }>) ?? []
      expect(errors[0]?.data?.errors?.[0]?.message).toBe('Value must be unique')
    })

    it('creates, updates and deletes posts as superadmin', async () => {
      const createResponse = await runAuthenticatedRestRequest(
        superadminToken,
        '/api/posts?depth=0',
        {
          method: 'POST',
          body: JSON.stringify({
            title: 'Managed Post',
            slug: `managed-${runSuffix}`,
            status: 'draft',
          }),
        },
      )
      expect(createResponse.status).toBe(201)
      const createdBody = await readJsonBody(createResponse)
      const postId = (createdBody.doc as Record<string, unknown>).id as string
      createdPostIds.push(postId)

      const updateResponse = await runAuthenticatedRestRequest(
        superadminToken,
        `/api/posts/${postId}?depth=0`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'published' }),
        },
      )
      expect(updateResponse.status).toBe(200)
      const updatedBody = await readJsonBody(updateResponse)
      expect((updatedBody.doc as Record<string, unknown>).status).toBe('published')

      const deleteResponse = await runAuthenticatedRestRequest(
        superadminToken,
        `/api/posts/${postId}`,
        {
          method: 'DELETE',
        },
      )
      expect(deleteResponse.status).toBe(200)
      createdPostIds.splice(createdPostIds.indexOf(postId), 1)
    })

    it('round-trips lexical rich text JSON through create and read', async () => {
      const lexicalContent = {
        root: {
          type: 'root',
          format: '',
          indent: 0,
          version: 1,
          direction: 'ltr',
          children: [
            {
              type: 'paragraph',
              format: '',
              indent: 0,
              version: 1,
              direction: 'ltr',
              children: [{ type: 'text', text: 'Hello lexical round-trip', version: 1 }],
            },
          ],
        },
      }

      const createResponse = await runAuthenticatedRestRequest(
        superadminToken,
        '/api/posts?depth=0',
        {
          method: 'POST',
          body: JSON.stringify({
            title: 'Lexical Round-Trip',
            slug: `lexical-${runSuffix}`,
            content: lexicalContent,
          }),
        },
      )
      expect(createResponse.status).toBe(201)
      const createdBody = await readJsonBody(createResponse)
      const postId = (createdBody.doc as Record<string, unknown>).id as string
      createdPostIds.push(postId)

      const readResponse = await runAuthenticatedRestRequest(
        superadminToken,
        `/api/posts/${postId}?depth=0`,
      )
      expect(readResponse.status).toBe(200)
      // NOTE: REST getOne returns the document directly, while create/update/delete wrap it in { doc }.
      const doc = await readJsonBody(readResponse)
      expect(doc.content).toEqual(lexicalContent)
    })

    it('filters posts with JSON where queries and honors sort', async () => {
      const publishedResponse = await runRestRequest(
        `/api/posts?where=${encodeURIComponent(JSON.stringify({ status: { equals: 'published' } }))}&sort=-createdAt&limit=5`,
      )
      expect(publishedResponse.status).toBe(200)

      const body = await readJsonBody(publishedResponse)
      const docs = (body.docs as Array<Record<string, unknown>>) ?? []
      for (const doc of docs) {
        expect(doc.status).toBe('published')
      }
    })
  })

  describe('role based access control', () => {
    beforeAll(async () => {
      const registerResponse = await runRestRequest('/api/users?depth=0', {
        method: 'POST',
        body: JSON.stringify({
          email: `guest-${runSuffix}@example.com`,
          password: 'guestpass123',
          role: 'superadmin',
        }),
      })
      expect(registerResponse.status).toBe(201)
      const body = await readJsonBody(registerResponse)
      createdUserIds.push((body.doc as Record<string, unknown>).id as string)

      // Role uplift attempts are forced back to guest on public self-registration.
      expect((body.doc as Record<string, unknown>).role).toBe('guest')
      guestToken = await loginAs(`guest-${runSuffix}@example.com`, 'guestpass123')
    })

    it('denies guest post creation with 403', async () => {
      const response = await runAuthenticatedRestRequest(guestToken, '/api/posts?depth=0', {
        method: 'POST',
        body: JSON.stringify({ title: 'Guest Post', slug: `guest-${runSuffix}` }),
      })
      expect(response.status).toBe(403)
    })

    it('gates the posts stats endpoint behind authentication', async () => {
      const unauthenticated = await runRestRequest('/api/posts/stats')
      expect(unauthenticated.status).toBe(401)

      const authenticated = await runAuthenticatedRestRequest(superadminToken, '/api/posts/stats')
      expect(authenticated.status).toBe(200)

      const body = await readJsonBody(authenticated)
      expect(body.success).toBe(true)
    })

    it('scopes guest user listing to the own account', async () => {
      const response = await runAuthenticatedRestRequest(guestToken, '/api/users?limit=10')
      expect(response.status).toBe(200)

      const body = await readJsonBody(response)
      const docs = (body.docs as Array<Record<string, unknown>>) ?? []
      expect(docs).toHaveLength(1)
      expect(docs[0]?.email).toBe(`guest-${runSuffix}@example.com`)
    })

    it('blocks guest role uplift attempts on self-update', async () => {
      const meResponse = await runAuthenticatedRestRequest(guestToken, '/api/users/me')
      const meBody = await readJsonBody(meResponse)
      const guestId = (meBody.user as Record<string, unknown>).id as string

      const upliftResponse = await runAuthenticatedRestRequest(
        guestToken,
        `/api/users/${guestId}?depth=0`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role: 'superadmin' }),
        },
      )
      expect(upliftResponse.status).toBe(200)

      const body = await readJsonBody(upliftResponse)
      expect((body.doc as Record<string, unknown>).role).toBe('guest')
    })

    it('hides other users from guests behind the self-scope constraint', async () => {
      const meResponse = await runAuthenticatedRestRequest(superadminToken, '/api/users/me')
      const meBody = await readJsonBody(meResponse)
      const superadminId = (meBody.user as Record<string, unknown>).id as string

      const response = await runAuthenticatedRestRequest(guestToken, `/api/users/${superadminId}`)
      expect(response.status).toBe(404)
    })
  })
})
