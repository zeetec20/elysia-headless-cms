import { Elysia } from 'elysia'
import { handleEndpoints } from 'payload'

import { typedEndpoints } from '@/elysia/typedEndpoints'
import configPromise from '@/payload.config'

const port = Number(process.env.PORT) || 3000

// NOTE: Elysia owns the process lifecycle: Bun stops the HTTP server on SIGINT/SIGTERM
// automatically, so the server instance does not need to be retained.
// Typed facade routes are matched first; every remaining /api/* method/path falls through
// to Payload's framework-agnostic REST engine (auth, cookies, CORS, CSRF, errors).
// `App` is the Eden-treaty name convention the dashboard's typed client imports.
export const App = new Elysia({ name: 'payload-elysia-api' })
  .use(typedEndpoints)
  .all('/api/*', ({ request }) => handleEndpoints({ config: configPromise, request }))

export type {
  PayloadListResponse,
  PayloadLoginResponse,
  PayloadMeResponse,
} from '@/elysia/typedEndpoints'

if (import.meta.main) {
  App.listen(port)
  console.log(`✓ Payload REST API (Elysia on Bun) listening on http://localhost:${port}/api`)
}
