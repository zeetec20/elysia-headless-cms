import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { Config, PayloadRequest } from 'payload'
import { scalar } from 'payload-oapi'
import { secureOpenApiDocsPlugin } from '@/handlers/system'

const createMockScalarPayloadRequest = (
  headersInit: Record<string, string> = {},
  overrides: Record<string, unknown> = {},
): PayloadRequest => {
  const headers = new Headers({
    host: 'localhost:3000',
    ...headersInit,
  })

  return {
    protocol: 'http:',
    headers,
    ...overrides,
  } as unknown as PayloadRequest
}

describe('Scalar Documentation Endpoint & Security', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('registers GET /docs returning Scalar HTML bundle with interactive playground', async () => {
    const scalarPlugin = scalar({ docsUrl: '/docs' })
    const baseConfig: Config = {
      endpoints: [],
    } as unknown as Config

    const configured = await scalarPlugin(baseConfig)
    const docsEndpoint = configured.endpoints?.find(
      (endpoint) => endpoint.path === '/docs' && endpoint.method === 'get',
    )

    expect(docsEndpoint).toBeDefined()

    const req = createMockScalarPayloadRequest()
    const response = await docsEndpoint?.handler(req)

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toBe('text/html')

    const html = await response?.text()
    expect(html).toContain('<div id="scalar-api"></div>')
    expect(html).toContain('https://cdn.jsdelivr.net/npm/@scalar/api-reference')
    expect(html).toContain('http://localhost:3000/api/openapi.json')
  })

  it('enforces basic auth on the Scalar endpoint when APP_ENV=uat', async () => {
    process.env.APP_ENV = 'uat'

    const scalarPlugin = scalar({ docsUrl: '/docs' })
    const baseConfig = await scalarPlugin({ endpoints: [] } as unknown as Config)
    const securedConfig = (await secureOpenApiDocsPlugin(baseConfig)) as Config

    const docsEndpoint = securedConfig.endpoints?.find((endpoint) => endpoint.path === '/docs')
    expect(docsEndpoint).toBeDefined()

    const unauthenticatedReq = createMockScalarPayloadRequest()
    const unauthorizedResponse = await docsEndpoint?.handler(unauthenticatedReq)
    expect(unauthorizedResponse?.status).toBe(401)
    expect(unauthorizedResponse?.headers.get('www-authenticate')).toContain('Basic')

    const invalidCredentials = Buffer.from('wrong:creds').toString('base64')
    const invalidAuthReq = createMockScalarPayloadRequest({
      authorization: `Basic ${invalidCredentials}`,
    })
    const invalidResponse = await docsEndpoint?.handler(invalidAuthReq)
    expect(invalidResponse?.status).toBe(401)
  })

  it('grants Scalar access only to in-process requests in UAT', async () => {
    process.env.APP_ENV = 'uat'

    const scalarPlugin = scalar({ docsUrl: '/docs' })
    const baseConfig = await scalarPlugin({ endpoints: [] } as unknown as Config)
    const securedConfig = (await secureOpenApiDocsPlugin(baseConfig)) as Config

    const docsEndpoint = securedConfig.endpoints?.find((endpoint) => endpoint.path === '/docs')
    expect(docsEndpoint).toBeDefined()

    const internalReq = createMockScalarPayloadRequest({}, { internalDocsRequest: true })
    const internalResponse = await docsEndpoint?.handler(internalReq)
    expect(internalResponse?.status).toBe(200)
    const internalHtml = await internalResponse?.text()
    expect(internalHtml).toContain('<div id="scalar-api"></div>')

    const headerBypassReq = createMockScalarPayloadRequest({
      'x-internal-docs': 'true',
    })
    const headerBypassResponse = await docsEndpoint?.handler(headerBypassReq)
    expect(headerBypassResponse?.status).toBe(401)
  })
})
