import { TypeRegistry } from '@sinclair/typebox'
import { Elysia, t } from 'elysia'
import { handleEndpoints } from 'payload'
import configPromise from '@/payload.config'
import type { Post, User } from '@/payload-types'
import type { PostsStatsResult } from '@/services/postsStatsService'
import type { ApiSuccessResponse } from '@/utils/apiResponseUtils'

// NOTE: TypeBox 0.34 does not register the 'Unsafe' kind, and Elysia's response validator
// compiles every response schema through TypeCompiler — so t.Unsafe responses crash route
// composition. Registering it as always-true restores the intended t.Unsafe semantics:
// typed for the client contract, never runtime-validated (Payload stays the engine).
if (!TypeRegistry.Has('Unsafe')) {
  TypeRegistry.Set('Unsafe', () => true)
}

/**
 * Payload REST wire shapes carried through the typed Elysia facade with `t.Unsafe`:
 * declared for the client contract, never runtime-validated (Payload stays the engine).
 */
export interface PayloadListResponse<TItem> {
  docs: TItem[]
  totalDocs: number
  page: number
  limit: number
  totalPages: number
}

export interface PayloadLoginResponse {
  user: User
  token?: string
  exp?: number
}

export interface PayloadMeResponse {
  user: User | null
  token?: string
  exp?: number
}

const postsBodySchema = t.Object({
  title: t.Optional(t.String()),
  slug: t.Optional(t.String()),
  status: t.Optional(t.Union([t.Literal('draft'), t.Literal('published')])),
  publishedAt: t.Optional(t.Union([t.String(), t.Null()])),
  content: t.Optional(t.Any()),
})

const usersBodySchema = t.Object({
  email: t.Optional(t.String()),
  password: t.Optional(t.String()),
  role: t.Optional(t.Union([t.Literal('guest'), t.Literal('superadmin')])),
  enableAPIKey: t.Optional(t.Union([t.Boolean(), t.String()])),
})

const collectionQuerySchema = t.Object({
  where: t.Optional(t.String()),
  sort: t.Optional(t.String()),
  page: t.Optional(t.Numeric()),
  limit: t.Optional(t.Numeric()),
  depth: t.Optional(t.String()),
})

const documentQuerySchema = t.Object({ depth: t.Optional(t.String()) })

// NOTE: Elysia's schema parsing consumes the original Request body stream, so mutating routes
// re-serialize the validated body onto a fresh Request. GET/DELETE forward the original object.
const forwardToPayloadEndpoints = async (request: Request, body?: unknown): Promise<Response> => {
  let outgoingRequest = request
  if (body !== undefined && !['GET'].includes(request.method)) {
    const headers = new Headers(request.headers)
    headers.delete('content-length')
    outgoingRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify(body),
    })
  }
  return handleEndpoints({ config: configPromise, request: outgoingRequest })
}

/**
 * Typed Elysia facade over the Payload REST engine for endpoints the Refine dashboard uses.
 * The `/api/*` catch-all in server.ts still owns every other path, method and client.
 */
export const typedEndpoints = new Elysia({ name: 'payload-typed-endpoints' })
  .post('/api/users/login', ({ request, body }) => forwardToPayloadEndpoints(request, body), {
    body: t.Object({ email: t.String(), password: t.String() }),
    response: t.Unsafe<PayloadLoginResponse>(),
  })
  .post('/api/users/logout', ({ request, body }) => forwardToPayloadEndpoints(request, body), {
    response: t.Unsafe<Record<string, string>>(),
  })
  .get('/api/users/me', ({ request }) => forwardToPayloadEndpoints(request), {
    response: t.Unsafe<PayloadMeResponse>(),
  })
  .get('/api/users', ({ request }) => forwardToPayloadEndpoints(request), {
    query: collectionQuerySchema,
    response: t.Unsafe<PayloadListResponse<User>>(),
  })
  .get('/api/users/:id', ({ request }) => forwardToPayloadEndpoints(request), {
    query: documentQuerySchema,
    response: t.Unsafe<User>(),
  })
  .post('/api/users', ({ request, body }) => forwardToPayloadEndpoints(request, body), {
    body: t.Object({
      email: t.String(),
      password: t.String(),
      role: t.Optional(t.Union([t.Literal('guest'), t.Literal('superadmin')])),
    }),
    response: t.Unsafe<{ doc: User }>(),
  })
  .patch('/api/users/:id', ({ request, body }) => forwardToPayloadEndpoints(request, body), {
    body: usersBodySchema,
    response: t.Unsafe<{ doc: User }>(),
  })
  .delete('/api/users/:id', ({ request, body }) => forwardToPayloadEndpoints(request, body), {
    response: t.Unsafe<{ doc: User }>(),
  })
  .get('/api/posts/stats', ({ request }) => forwardToPayloadEndpoints(request), {
    response: t.Unsafe<ApiSuccessResponse<PostsStatsResult>>(),
  })
  .get('/api/posts', ({ request }) => forwardToPayloadEndpoints(request), {
    query: collectionQuerySchema,
    response: t.Unsafe<PayloadListResponse<Post>>(),
  })
  .get('/api/posts/:id', ({ request }) => forwardToPayloadEndpoints(request), {
    query: documentQuerySchema,
    response: t.Unsafe<Post>(),
  })
  .post('/api/posts', ({ request, body }) => forwardToPayloadEndpoints(request, body), {
    body: t.Object({
      title: t.String(),
      slug: t.String(),
      status: t.Optional(t.Union([t.Literal('draft'), t.Literal('published')])),
      publishedAt: t.Optional(t.Union([t.String(), t.Null()])),
      content: t.Optional(t.Any()),
    }),
    response: t.Unsafe<{ doc: Post }>(),
  })
  .patch('/api/posts/:id', ({ request, body }) => forwardToPayloadEndpoints(request, body), {
    body: postsBodySchema,
    response: t.Unsafe<{ doc: Post }>(),
  })
  .delete('/api/posts/:id', ({ request, body }) => forwardToPayloadEndpoints(request, body), {
    response: t.Unsafe<{ doc: Post }>(),
  })
