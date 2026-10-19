import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { Config, PayloadRequest } from 'payload'
import { scalar } from 'payload-oapi'
import { secureOpenApiDocsPlugin } from '@/handlers/system'

const createMockScalarPayloadRequest = (
  headersInit: Record<string, string> = {},
): PayloadRequest => {
  const headers = new Headers({
    host: 'localhost:3000',
    ...headersInit,
  })

  return {
    protocol: 'http:',
    headers,
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

  it('enforces Basic Auth on Scalar endpoint when APP_ENV=uat', async () => {
    process.env.APP_ENV = 'uat'
    process.env.OPENAPI_DOCS_USER = 'uat-admin'
    process.env.OPENAPI_DOCS_PASSWORD = 'uat-secret123'

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

  it('grants access to Scalar endpoint with valid credentials or x-internal-docs header', async () => {
    process.env.APP_ENV = 'uat'
    process.env.OPENAPI_DOCS_USER = 'uat-admin'
    process.env.OPENAPI_DOCS_PASSWORD = 'uat-secret123'

    const scalarPlugin = scalar({ docsUrl: '/docs' })
    const baseConfig = await scalarPlugin({ endpoints: [] } as unknown as Config)
    const securedConfig = (await secureOpenApiDocsPlugin(baseConfig)) as Config

    const docsEndpoint = securedConfig.endpoints?.find((endpoint) => endpoint.path === '/docs')
    expect(docsEndpoint).toBeDefined()

    const validCredentials = Buffer.from('uat-admin:uat-secret123').toString('base64')
    const validAuthReq = createMockScalarPayloadRequest({
      authorization: `Basic ${validCredentials}`,
    })
    const validAuthResponse = await docsEndpoint?.handler(validAuthReq)
    expect(validAuthResponse?.status).toBe(200)
    const validAuthHtml = await validAuthResponse?.text()
    expect(validAuthHtml).toContain('<div id="scalar-api"></div>')

    const bypassReq = createMockScalarPayloadRequest({
      'x-internal-docs': 'true',
    })
    const bypassResponse = await docsEndpoint?.handler(bypassReq)
    expect(bypassResponse?.status).toBe(200)
    const bypassHtml = await bypassResponse?.text()
    expect(bypassHtml).toContain('<div id="scalar-api"></div>')
  })
})
