import createClient from 'openapi-fetch'
import type { paths } from '../src/api/schema'

// Runtime probe for the OpenAPI REST client contract against the live API stack (bun).
// NOTE: bun fetch omits Origin/Sec-Fetch-Site, so every probe forwards the dashboard origin and
// same-site marks for cookie auth — in the browser fetch semantics adds these automatically.
const DASHBOARD_ORIGIN = 'http://localhost:5173'
const browserCookieHeaders = (cookie: string): Record<string, string> => ({
  cookie,
  origin: DASHBOARD_ORIGIN,
  'sec-fetch-site': 'same-origin',
})

const client = createClient<paths>({
  baseUrl: process.env.VERIFY_API_URL ?? 'http://localhost:3000',
})

const run = async (): Promise<void> => {
  const login = await client.POST('/api/users/login', {
    body: { email: 'admin@example.com', password: 'password123' },
  })
  const setCookie = login.response.headers.get('set-cookie')
  const cookie = setCookie ? (setCookie.split(';')[0] ?? '') : ''
  console.log('login:', login.response.status, `role=${login.data?.user.role}`)

  const me = await client.GET('/api/users/me', {
    headers: browserCookieHeaders(cookie),
  })
  console.log('me:', me.response.status, `role=${me.data?.user?.role}`)

  const list = await client.GET('/api/posts', {
    params: {
      query: { limit: 2, page: 1, depth: 0, sort: '-createdAt' },
    },
    headers: browserCookieHeaders(cookie),
  })
  console.log('list:', list.response.status, `totalDocs=${list.data?.totalDocs}`)

  const stats = await client.GET('/api/posts/stats', {
    headers: browserCookieHeaders(cookie),
  })
  console.log('stats:', stats.response.status, `totalPosts=${stats.data?.data.totalPosts}`)

  const postId = list.data?.docs?.[0]?.id
  if (postId) {
    const patched = await client.PATCH('/api/posts/{id}', {
      params: {
        path: { id: String(postId) },
        query: { depth: 0 },
      },
      body: { title: 'REST probe title' },
      headers: browserCookieHeaders(cookie),
    })
    console.log('patch:', patched.response.status, `title=${patched.data?.title}`)
  }
}

await run()
