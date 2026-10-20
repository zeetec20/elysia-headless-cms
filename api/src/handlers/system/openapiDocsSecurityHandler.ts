import type { Config, PayloadHandler, PayloadRequest, Plugin } from 'payload'

import {
  isOpenApiDocsDevelopmentEnvironment,
  isOpenApiDocsUatEnvironment,
} from '../../utils/openApiDocsUtils'

const isOpenApiDocsSecuredPath = (path: string): boolean => {
  return (
    path === '/docs' ||
    path === '/openapi.json' ||
    path === '/openapi-auth' ||
    path.startsWith('/docs/') ||
    path.startsWith('/openapi/')
  )
}

const extractOpenApiRequestHeader = (req: PayloadRequest, headerName: string): string | null => {
  const target = headerName.toLowerCase()
  if (req.headers instanceof Headers) {
    return req.headers.get(target)
  }
  if (req.headers && typeof req.headers === 'object') {
    const record = req.headers as Record<string, string | string[] | undefined>
    for (const [key, value] of Object.entries(record)) {
      if (key.toLowerCase() === target) {
        return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
      }
    }
  }
  return null
}

const verifyOpenApiDocsAccess = (req: PayloadRequest): Response | null => {
  const internalDocsHeader = extractOpenApiRequestHeader(req, 'x-internal-docs')
  const isInternalBypass = internalDocsHeader === 'true' || Boolean(req.user)
  if (isInternalBypass) {
    return null
  }

  // NOTE: Local development serves the docs without credentials; UAT still requires basic auth.
  if (isOpenApiDocsDevelopmentEnvironment()) {
    return null
  }

  if (!isOpenApiDocsUatEnvironment()) {
    return Response.json(
      {
        error: 'Not Found',
        message: 'OpenAPI documentation is restricted to the UAT environment.',
      },
      { status: 404 },
    )
  }

  const authHeader = extractOpenApiRequestHeader(req, 'authorization')
  if (!authHeader?.startsWith('Basic ')) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'HTTP Basic Authentication required for UAT OpenAPI documentation.',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Basic realm="OpenAPI Documentation (UAT)"',
        },
      },
    )
  }

  const base64Credentials = authHeader.slice(6).trim()
  const decoded = Buffer.from(base64Credentials, 'base64').toString('utf-8')
  const colonIndex = decoded.indexOf(':')
  const username = colonIndex !== -1 ? decoded.slice(0, colonIndex) : ''
  const password = colonIndex !== -1 ? decoded.slice(colonIndex + 1) : ''

  const expectedUser = process.env.OPENAPI_DOCS_USER || 'uat-admin'
  const expectedPassword = process.env.OPENAPI_DOCS_PASSWORD || 'uat-secret123'

  if (username !== expectedUser || password !== expectedPassword) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Invalid OpenAPI documentation credentials.',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Basic realm="OpenAPI Documentation (UAT)"',
        },
      },
    )
  }

  return null
}

export const secureOpenApiDocsPlugin: Plugin = (incomingConfig: Config): Config => {
  const endpoints = incomingConfig.endpoints?.map((endpoint) => {
    if (!isOpenApiDocsSecuredPath(endpoint.path)) {
      return endpoint
    }

    const originalHandler = endpoint.handler
    return {
      ...endpoint,
      handler: (async (req: PayloadRequest): Promise<Response> => {
        const securityResponse = verifyOpenApiDocsAccess(req)
        if (securityResponse) {
          return securityResponse
        }
        return originalHandler(req)
      }) as PayloadHandler,
    }
  })

  return {
    ...incomingConfig,
    endpoints,
  }
}
