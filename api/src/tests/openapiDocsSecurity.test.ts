import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { Config, PayloadHandler, PayloadRequest } from 'payload'
import { secureOpenApiDocsPlugin } from '@/handlers/system'

describe('OpenAPI Docs Security Plugin', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns 404 in non-UAT environment', async () => {
    process.env.APP_ENV = 'production'

    const dummyHandler: PayloadHandler = async () => new Response('docs', { status: 200 })
    const baseConfig: Config = {
      endpoints: [
        {
          path: '/docs',
          method: 'get',
          handler: dummyHandler,
        },
      ],
    } as unknown as Config

    const securedConfig = (await secureOpenApiDocsPlugin(baseConfig)) as Config
    const endpoint = securedConfig.endpoints?.find((e: { path: string }) => e.path === '/docs')

    const req = {
      headers: new Headers(),
    } as unknown as PayloadRequest

    const response = await endpoint?.handler(req)
    expect(response?.status).toBe(404)
  })

  it('allows access in non-UAT if x-internal-docs header is true', async () => {
    process.env.APP_ENV = 'production'

    const dummyHandler: PayloadHandler = async () => new Response('docs-content', { status: 200 })
    const baseConfig: Config = {
      endpoints: [
        {
          path: '/docs',
          method: 'get',
          handler: dummyHandler,
        },
      ],
    } as unknown as Config

    const securedConfig = (await secureOpenApiDocsPlugin(baseConfig)) as Config
    const endpoint = securedConfig.endpoints?.find((e: { path: string }) => e.path === '/docs')
    const req = {
      headers: new Headers({
        'x-internal-docs': 'true',
      }),
    } as unknown as PayloadRequest

    const response = await endpoint?.handler(req)
    expect(response?.status).toBe(200)
    const text = await response?.text()
    expect(text).toBe('docs-content')
  })

  it('requires basic auth in UAT environment and rejects unauthenticated request', async () => {
    process.env.APP_ENV = 'uat'

    const dummyHandler: PayloadHandler = async () => new Response('docs', { status: 200 })
    const baseConfig: Config = {
      endpoints: [
        {
          path: '/openapi.json',
          method: 'get',
          handler: dummyHandler,
        },
      ],
    } as unknown as Config

    const securedConfig = (await secureOpenApiDocsPlugin(baseConfig)) as Config
    const endpoint = securedConfig.endpoints?.find(
      (e: { path: string }) => e.path === '/openapi.json',
    )
    const req = {
      headers: new Headers(),
    } as unknown as PayloadRequest

    const response = await endpoint?.handler(req)
    expect(response?.status).toBe(401)
    expect(response?.headers.get('www-authenticate')).toContain('Basic')
  })

  it('allows access in UAT with valid basic auth credentials', async () => {
    process.env.APP_ENV = 'uat'
    process.env.OPENAPI_DOCS_USER = 'test-user'
    process.env.OPENAPI_DOCS_PASSWORD = 'test-password'

    const dummyHandler: PayloadHandler = async () => new Response('spec-ok', { status: 200 })
    const baseConfig: Config = {
      endpoints: [
        {
          path: '/openapi.json',
          method: 'get',
          handler: dummyHandler,
        },
      ],
    } as unknown as Config

    const securedConfig = (await secureOpenApiDocsPlugin(baseConfig)) as Config
    const endpoint = securedConfig.endpoints?.find(
      (e: { path: string }) => e.path === '/openapi.json',
    )
    const credentials = Buffer.from('test-user:test-password').toString('base64')
    const req = {
      headers: new Headers({
        authorization: `Basic ${credentials}`,
      }),
    } as unknown as PayloadRequest

    const response = await endpoint?.handler(req)
    expect(response?.status).toBe(200)
    const text = await response?.text()
    expect(text).toBe('spec-ok')
  })
})
