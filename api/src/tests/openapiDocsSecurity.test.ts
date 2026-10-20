import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { pbkdf2 } from 'node:crypto'
import type { Config, Payload, PayloadHandler, PayloadRequest } from 'payload'
import { secureOpenApiDocsPlugin } from '@/handlers/system'

interface MockUserRecord {
  email: string
  hash: string
  id: string
  role: string
  salt: string
}

const SUPER_ADMIN_EMAIL = 'admin@example.com'
const SUPER_ADMIN_PASSWORD = 'super-secret123'
const GUEST_EMAIL = 'guest@example.com'
const GUEST_PASSWORD = 'guest-secret123'
const PASSWORD_SALT = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const createPayloadPasswordHash = (password: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    pbkdf2(password, PASSWORD_SALT, 600_000, 32, 'sha256', (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }

      resolve(`pbkdf2-sha256-v1:${derivedKey.toString('hex')}`)
    })
  })
}

const createMockDocsPayload = (users: MockUserRecord[]): Payload => {
  return {
    db: {
      findOne: async ({ where }: { where: { email: { equals: string } } }) => {
        return users.find((user) => user.email === where.email.equals) ?? null
      },
    },
  } as unknown as Payload
}

const createBasicAuthHeader = (email: string, password: string): string => {
  return `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`
}

const createSecuredDocsEndpoint = async (path = '/docs'): Promise<PayloadHandler> => {
  const dummyHandler: PayloadHandler = async () => new Response('docs-content', { status: 200 })
  const baseConfig = {
    endpoints: [
      {
        path,
        method: 'get',
        handler: dummyHandler,
      },
    ],
  } as unknown as Config

  const securedConfig = (await secureOpenApiDocsPlugin(baseConfig)) as Config

  return securedConfig.endpoints?.find((endpoint) => endpoint.path === path)
    ?.handler as PayloadHandler
}

describe('OpenAPI Docs Security Plugin', () => {
  const originalEnv = { ...process.env }
  let superAdminUser: MockUserRecord
  let guestUser: MockUserRecord

  beforeAll(async () => {
    const [superAdminHash, guestHash] = await Promise.all([
      createPayloadPasswordHash(SUPER_ADMIN_PASSWORD),
      createPayloadPasswordHash(GUEST_PASSWORD),
    ])

    superAdminUser = {
      email: SUPER_ADMIN_EMAIL,
      hash: superAdminHash,
      id: 'super-admin-id',
      role: 'superadmin',
      salt: PASSWORD_SALT,
    }
    guestUser = {
      email: GUEST_EMAIL,
      hash: guestHash,
      id: 'guest-id',
      role: 'guest',
      salt: PASSWORD_SALT,
    }
  })

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns 404 in production without credentials', async () => {
    process.env.APP_ENV = 'production'

    const endpointHandler = await createSecuredDocsEndpoint()
    const response = await endpointHandler({
      headers: new Headers(),
      payload: createMockDocsPayload([superAdminUser, guestUser]),
    } as unknown as PayloadRequest)

    expect(response.status).toBe(404)
  })

  it('returns 404 in production even with valid superadmin credentials', async () => {
    process.env.APP_ENV = 'production'

    const endpointHandler = await createSecuredDocsEndpoint()
    const response = await endpointHandler({
      headers: new Headers({
        authorization: createBasicAuthHeader(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD),
      }),
      payload: createMockDocsPayload([superAdminUser, guestUser]),
    } as unknown as PayloadRequest)

    expect(response.status).toBe(404)
  })

  it('allows access in development without credentials', async () => {
    process.env.APP_ENV = 'development'

    const endpointHandler = await createSecuredDocsEndpoint()
    const response = await endpointHandler({
      headers: new Headers(),
    } as unknown as PayloadRequest)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('docs-content')
  })

  it('requires basic auth in UAT and challenges unauthenticated requests', async () => {
    process.env.APP_ENV = 'uat'

    const endpointHandler = await createSecuredDocsEndpoint('/openapi.json')
    const response = await endpointHandler({
      headers: new Headers(),
      payload: createMockDocsPayload([superAdminUser, guestUser]),
    } as unknown as PayloadRequest)

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('Basic')
  })

  it('rejects guest credentials in UAT', async () => {
    process.env.APP_ENV = 'uat'

    const endpointHandler = await createSecuredDocsEndpoint('/openapi.json')
    const response = await endpointHandler({
      headers: new Headers({
        authorization: createBasicAuthHeader(GUEST_EMAIL, GUEST_PASSWORD),
      }),
      payload: createMockDocsPayload([superAdminUser, guestUser]),
    } as unknown as PayloadRequest)

    expect(response.status).toBe(401)
  })

  it('rejects superadmin credentials with a wrong password in UAT', async () => {
    process.env.APP_ENV = 'uat'

    const endpointHandler = await createSecuredDocsEndpoint('/openapi.json')
    const response = await endpointHandler({
      headers: new Headers({
        authorization: createBasicAuthHeader(SUPER_ADMIN_EMAIL, 'not-the-password'),
      }),
      payload: createMockDocsPayload([superAdminUser, guestUser]),
    } as unknown as PayloadRequest)

    expect(response.status).toBe(401)
  })

  it('allows superadmin credentials in UAT', async () => {
    process.env.APP_ENV = 'uat'

    const endpointHandler = await createSecuredDocsEndpoint('/openapi.json')
    const response = await endpointHandler({
      headers: new Headers({
        authorization: createBasicAuthHeader(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD),
      }),
      payload: createMockDocsPayload([superAdminUser, guestUser]),
    } as unknown as PayloadRequest)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('docs-content')
  })

  it('rejects authenticated guest sessions in UAT', async () => {
    process.env.APP_ENV = 'uat'

    const endpointHandler = await createSecuredDocsEndpoint('/openapi.json')
    const response = await endpointHandler({
      headers: new Headers(),
      payload: createMockDocsPayload([superAdminUser, guestUser]),
      user: { collection: 'users', id: 'guest-id', role: 'guest' },
    } as unknown as PayloadRequest)

    expect(response.status).toBe(401)
  })

  it('ignores the x-internal-docs header', async () => {
    process.env.APP_ENV = 'uat'

    const endpointHandler = await createSecuredDocsEndpoint('/openapi.json')
    const response = await endpointHandler({
      headers: new Headers({
        'x-internal-docs': 'true',
      }),
      payload: createMockDocsPayload([superAdminUser, guestUser]),
    } as unknown as PayloadRequest)

    expect(response.status).toBe(401)
  })

  it('allows in-process requests marked with internalDocsRequest', async () => {
    process.env.APP_ENV = 'production'

    const endpointHandler = await createSecuredDocsEndpoint('/openapi.json')
    const response = await endpointHandler({
      headers: new Headers(),
      internalDocsRequest: true,
    } as unknown as PayloadRequest)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('docs-content')
  })
})
