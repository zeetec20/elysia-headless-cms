import { Elysia } from 'elysia'
import { getPayload, handleEndpoints } from 'payload'

import { executePendingDatabaseMigrations } from './migrations/runPendingMigrations'
import configPromise from './payload.config'
import { withHttpRequestLogging } from './utils/httpRequestLoggerUtils'

const payloadPromise = getPayload({ config: configPromise })
payloadPromise.catch(() => {})

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
  logger: async () => {
    try {
      const payload = await payloadPromise
      return payload.logger
    } catch {
      return undefined
    }
  },
})

export const App = new Elysia({ name: 'payload-elysia-api' })
  .all('/api/*', ({ request }) => handleApiRequest(request))
  .all('/api', ({ request }) => handleApiRequest(request))
export type {
  PayloadListResponse,
  PayloadLoginResponse,
  PayloadMeResponse,
} from './types/apiResponseTypes'

if (import.meta.main) {
  try {
    const payload = await payloadPromise
    await executePendingDatabaseMigrations(payload)
  } catch (error) {
    console.error('Failed to run pending database migrations on startup:', error)
  }
  App.listen({ port, backlog: 2048 })
  console.log(`✓ Payload REST API (Elysia) listening on http://localhost:${port}/api`)
}
