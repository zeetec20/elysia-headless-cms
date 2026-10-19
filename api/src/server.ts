import { getPayload, handleEndpoints } from 'payload'

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
  logger: async () => {
    try {
      const payload = await payloadPromise
      return payload.logger
    } catch {
      return undefined
    }
  },
})

export const App = {
  handle: handleApiRequest,
  fetch: handleApiRequest,
}
export type {
  PayloadListResponse,
  PayloadLoginResponse,
  PayloadMeResponse,
} from './types/apiResponseTypes'

if (import.meta.main) {
  Bun.serve({ port, fetch: handleApiRequest })
  console.log(`✓ Payload REST API (Bun.serve) listening on http://localhost:${port}/api`)
}
