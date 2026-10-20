import { Elysia } from 'elysia'
import { getPayload, handleEndpoints, type PayloadLogger } from 'payload'

import { executePendingDatabaseMigrations } from './migrations/runPendingMigrations'
import configPromise from './payload.config'
import { withHttpRequestLogging } from './utils/httpRequestLoggerUtils'
import {
  isOpenApiDocsPrintableEnvironment,
  isOpenApiDocsUatEnvironment,
  resolveOpenApiDocsUrl,
} from './utils/openApiDocsUtils'
import { logError, logInfo, setDefaultPayloadLogger } from './utils/payloadLoggerUtils'

export type {
  PayloadListResponse,
  PayloadLoginResponse,
  PayloadMeResponse,
} from './types/apiResponseTypes'

const payloadPromise = getPayload({ config: configPromise })
payloadPromise.catch(() => {})

let cachedPayloadLogger: PayloadLogger | undefined
payloadPromise
  .then((payload) => {
    cachedPayloadLogger = payload.logger
    setDefaultPayloadLogger(payload.logger)
  })
  .catch(() => {})

const port = Number(process.env.PORT) || 3000

const handleApiEndpoint = async (request: Request): Promise<Response> => {
  const url = new URL(request.url)
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    return handleEndpoints({ config: configPromise, request })
  }

  return new Response('Not Found', { status: 404 })
}

export const handleApiRequest = withHttpRequestLogging(handleApiEndpoint, {
  disabled: process.env.DISABLE_REQUEST_LOGGING === 'true',
  logger: () => cachedPayloadLogger,
})

export const App = new Elysia({ name: 'payload-elysia-api' })
  .all('/api/*', ({ request }) => handleApiRequest(request))
  .all('/api', ({ request }) => handleApiRequest(request))

if (import.meta.main) {
  try {
    const payload = await payloadPromise
    cachedPayloadLogger = payload.logger
    setDefaultPayloadLogger(payload.logger)
    await executePendingDatabaseMigrations(payload)

    App.listen({ port, backlog: 2048 })
    logInfo(payload, `✓ Payload REST API (Elysia) listening on http://localhost:${port}/api`)

    if (isOpenApiDocsPrintableEnvironment()) {
      logInfo(payload, `✓ Scalar OpenAPI docs: ${resolveOpenApiDocsUrl(process.env, port)}`)

      if (isOpenApiDocsUatEnvironment()) {
        logInfo(
          payload,
          '  OpenAPI docs require HTTP basic auth (OPENAPI_DOCS_USER / OPENAPI_DOCS_PASSWORD)',
        )
      }
    }
  } catch (error) {
    logError(cachedPayloadLogger, 'Failed to run pending database migrations on startup:', error)
  }
}
