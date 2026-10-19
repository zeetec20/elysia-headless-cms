import { Elysia } from 'elysia'
import { handleEndpoints } from 'payload'

import configPromise from './payload.config'
import { httpRequestLoggingPlugin } from './utils/httpRequestLoggerUtils'

const port = Number(process.env.PORT) || 3000

// NOTE: Elysia owns the process lifecycle: Bun stops the HTTP server on SIGINT/SIGTERM
// Every /api/* method/path delegates directly to Payload's framework-agnostic REST engine
// (auth, cookies, CORS, CSRF, custom endpoints, OpenAPI docs, errors).
export const App = new Elysia({ name: 'payload-elysia-api' })
  .use(httpRequestLoggingPlugin)
  .all('/api/*', ({ request }) => handleEndpoints({ config: configPromise, request }))

export type {
  PayloadListResponse,
  PayloadLoginResponse,
  PayloadMeResponse,
} from './types/apiResponseTypes'

if (import.meta.main) {
  App.listen(port)
  console.log(`✓ Payload REST API (Elysia on Bun) listening on http://localhost:${port}/api`)
}
