import type {
  CollectionConfig,
  Config,
  Endpoint,
  PayloadHandler,
  PayloadRequest,
  Plugin,
} from 'payload'
import { createApiErrorResponse } from './apiResponseUtils'

export type CustomEndpoint = Endpoint & {
  authenticated?: boolean
}

export type CustomCollectionConfig = Omit<CollectionConfig, 'endpoints'> & {
  endpoints?: CustomEndpoint[] | false
}

export const normalizeEndpointRequestHeaders = (req: PayloadRequest): Headers => {
  const headers = req.headers instanceof Headers ? new Headers(req.headers) : new Headers()

  if (!(req.headers instanceof Headers) && req.headers && typeof req.headers === 'object') {
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers.set(key, value)
      } else if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(key, item)
        }
      }
    }
  }

  let token = headers.get('authorization')?.trim() || headers.get('x-api-key')?.trim()
  if (!token) {
    return headers
  }

  token = token.replace(/^api-?key\s+/i, '')
  if (!token.includes(' ')) {
    token = token.split('.').length === 3 ? `Bearer ${token}` : `users API-Key ${token}`
  }

  headers.set('authorization', token)
  return headers
}

const verifyEndpointAuthentication = async (req: PayloadRequest): Promise<boolean> => {
  if (req.user) {
    return true
  }

  try {
    const authResult = await req.payload.auth({
      headers: normalizeEndpointRequestHeaders(req),
      req,
    })
    if (authResult?.user) {
      req.user = authResult.user
      return true
    }
  } catch {
    // Authentication failed or invalid token
  }

  return false
}

export const withEndpointAuth = (handler: PayloadHandler): PayloadHandler => {
  return async (req: PayloadRequest): Promise<Response> => {
    const isAuthenticated = await verifyEndpointAuthentication(req)
    if (!isAuthenticated) {
      return createApiErrorResponse('Unauthorized: Valid API key required', 401, {
        'WWW-Authenticate': 'ApiKey realm="Payload API"',
      })
    }
    return handler(req)
  }
}

const wrapEndpointAuthenticationHandlers = (endpoints?: Endpoint[]): Endpoint[] | undefined => {
  if (!endpoints) {
    return endpoints
  }
  return endpoints.map((endpoint) => {
    const isAuthRequired = Boolean(
      (endpoint as CustomEndpoint).authenticated ?? endpoint.custom?.authenticated,
    )

    if (isAuthRequired && endpoint.handler) {
      return {
        ...endpoint,
        handler: withEndpointAuth(endpoint.handler),
      }
    }
    return endpoint
  })
}

export const endpointAuthMiddlewarePlugin: Plugin = (config: Config): Config => {
  return {
    ...config,
    endpoints: wrapEndpointAuthenticationHandlers(config.endpoints),
    collections: config.collections?.map((collection) => ({
      ...collection,
      endpoints: wrapEndpointAuthenticationHandlers(collection.endpoints as Endpoint[] | undefined),
    })),
    globals: config.globals?.map((global) => ({
      ...global,
      endpoints: wrapEndpointAuthenticationHandlers(global.endpoints as Endpoint[] | undefined),
    })),
  }
}
