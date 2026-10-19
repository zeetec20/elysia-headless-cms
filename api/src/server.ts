import { Elysia } from 'elysia'
import { handleEndpoints } from 'payload'
import configPromise from '@/payload.config'

const port = Number(process.env.PORT) || 3000

// NOTE: Elysia owns the process lifecyle: Bun stops the HTTP server on SIGINT/SIGTERM
// automatically, so the server instance does not need to be retained.
new Elysia({ name: 'payload-elysia-api' })
  // NOTE: Payload's own Fetch-agnostic REST engine handles every /api/* route: auth strategies,
  // cookies, CORS, custom collection/global endpoints, openapi docs and errors.
  .all('/api/*', ({ request }) => handleEndpoints({ config: configPromise, request }))
  .listen(port)

console.log(`✓ Payload REST API (Elysia on Bun) listening on http://localhost:${port}/api`)
