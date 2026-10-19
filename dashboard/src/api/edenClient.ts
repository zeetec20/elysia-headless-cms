import { treaty } from '@elysiajs/eden'
import type { App } from 'payload-elysia-api/server'

// NOTE: Same-origin treaty client. The Vite proxy (dev) or /api rewrite (Vercel prod) keeps the
// httpOnly session cookie and the API's CSRF allowlist valid without CORS friction, so browser
// fetch semantics add the required Origin / Sec-Fetch-Site headers automatically.
// Route segments mirror the /api prefix, so consumers navigate via payloadApi.users / payloadApi.posts.
export const payloadApi = treaty<typeof App>('').api
