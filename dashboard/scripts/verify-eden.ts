import { treaty } from '@elysiajs/eden'
import type { App } from 'payload-elysia-api/server'

// Runtime probe for the Eden treaty contract against the live API stack (bun).
// NOTE: bun fetch omits Origin/Sec-Fetch-Site, so every probe forwards the dashboard origin and
// same-site marks for cookie auth — in the browser fetch semantics adds these automatically.
const DASHBOARD_ORIGIN = 'http://localhost:5173'
const browserCookieHeaders = (cookie: string): Record<string, string> => ({
  cookie,
  origin: DASHBOARD_ORIGIN,
  'sec-fetch-site': 'same-origin',
})
const api = treaty<typeof App>(process.env.VERIFY_API_URL ?? 'http://localhost:3001').api

const run = async (): Promise<void> => {
  const login = await api.users.login.post({ email: 'admin@example.com', password: 'password123' })
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0] ?? ''
  console.log('login:', login.status, `role=${login.data?.user.role}`)

  const me = await api.users.me.get({ headers: browserCookieHeaders(cookie) })
  console.log('me:', me.status, `role=${me.data?.user?.role}`)

  const list = await api.posts.get({
    query: { limit: 2, page: 1, depth: '0', sort: '-createdAt' },
    headers: browserCookieHeaders(cookie),
  })
  console.log('list:', list.status, `totalDocs=${list.data?.totalDocs}`)

  const stats = await api.posts.stats.get({ headers: browserCookieHeaders(cookie) })
  console.log('stats:', stats.status, `totalPosts=${stats.data?.data.totalPosts}`)

  const postId = list.data?.docs[0]?.id
  if (postId) {
    // NOTE: runtime needs index access for :param routes; cast mirrors the dataProvider helper.
    type PostRoute = ReturnType<typeof api.posts>
    const postsDocumentRoute = (id: string): PostRoute =>
      (api.posts as unknown as Record<string, PostRoute>)[id]

    const patched = await postsDocumentRoute(postId).patch(
      { title: 'Eden probe title' },
      { query: { depth: '0' }, headers: browserCookieHeaders(cookie) },
    )
    console.log('patch:', patched.status, `title=${patched.data?.doc.title}`)
  }
}

await run()
