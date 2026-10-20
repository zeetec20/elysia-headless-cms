import type {
  CollectionConfig,
  Config,
  Endpoint,
  PayloadHandler,
  PayloadRequest,
  Plugin,
} from 'payload'
import { PAYLOAD_API_BEARER_REALM } from '../constants'
import { createApiErrorResponse } from './apiResponseUtils'

export type CustomEndpoint = Endpoint & {
  authenticated?: boolean
}

export type CustomCollectionConfig = Omit<CollectionConfig, 'endpoints'> & {
  endpoints?: CustomEndpoint[] | false
}

export const withEndpointAuth = (handler: PayloadHandler): PayloadHandler => {
  return async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) {
      return createApiErrorResponse('Unauthorized: Valid Bearer token required', 401, {
        'WWW-Authenticate': `Bearer realm="${PAYLOAD_API_BEARER_REALM}"`,
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
