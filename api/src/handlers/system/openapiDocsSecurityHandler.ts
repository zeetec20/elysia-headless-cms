import type { Config, PayloadHandler, PayloadRequest, Plugin } from 'payload'

import {
  HTTP_BASIC_AUTH_SCHEME,
  OPEN_API_AUTH_ROUTE_PATH,
  OPEN_API_DOCS_BASIC_AUTH_REALM,
  OPEN_API_DOCS_ROUTE_PATH,
  OPEN_API_ROUTE_PREFIX,
  OPEN_API_SPEC_ROUTE_PATH,
} from '../../constants'
import {
  authenticateOpenApiDocsSuperAdmin,
  parseOpenApiDocsBasicCredentials,
} from '../../utils/openApiDocsAuthUtils'
import {
  isOpenApiDocsDevelopmentEnvironment,
  isOpenApiDocsUatEnvironment,
} from '../../utils/openApiDocsUtils'

interface InternalOpenApiDocsRequest extends PayloadRequest {
  internalDocsRequest?: boolean
}

const isOpenApiDocsSecuredPath = (path: string): boolean => {
  return (
    path === OPEN_API_DOCS_ROUTE_PATH ||
    path === OPEN_API_SPEC_ROUTE_PATH ||
    path === OPEN_API_AUTH_ROUTE_PATH ||
    path.startsWith(`${OPEN_API_DOCS_ROUTE_PATH}/`) ||
    path.startsWith(`${OPEN_API_ROUTE_PREFIX}/`)
  )
}

const createOpenApiDocsUnauthorizedResponse = (): Response => {
  return new Response(
    JSON.stringify({
      error: 'Unauthorized',
      message:
        'HTTP Basic Authentication with a superadmin account is required for UAT OpenAPI documentation.',
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `${HTTP_BASIC_AUTH_SCHEME}realm="${OPEN_API_DOCS_BASIC_AUTH_REALM}"`,
      },
    },
  )
}

const createOpenApiDocsNotFoundResponse = (): Response => {
  return Response.json(
    {
      error: 'Not Found',
      message: 'OpenAPI documentation is restricted to the UAT environment.',
    },
    { status: 404 },
  )
}

const verifyOpenApiDocsAccess = async (req: PayloadRequest): Promise<Response | null> => {
  // NOTE: In-process callers (scripts/generate-openapi.ts) mark the request; HTTP clients cannot forge it.
  if ((req as InternalOpenApiDocsRequest).internalDocsRequest === true) {
    return null
  }

  // NOTE: Local development serves the docs without credentials; UAT requires superadmin basic auth.
  if (isOpenApiDocsDevelopmentEnvironment()) {
    return null
  }

  if (!isOpenApiDocsUatEnvironment()) {
    return createOpenApiDocsNotFoundResponse()
  }

  const credentials = parseOpenApiDocsBasicCredentials(req)
  const isSuperAdmin =
    credentials !== null && (await authenticateOpenApiDocsSuperAdmin(req.payload, credentials))

  return isSuperAdmin ? null : createOpenApiDocsUnauthorizedResponse()
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
        const securityResponse = await verifyOpenApiDocsAccess(req)

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
