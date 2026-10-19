import type {
  BaseRecord,
  CreateParams,
  CrudFilter,
  CrudFilters,
  CrudOperators,
  CrudSorting,
  DataProvider,
  DeleteManyParams,
  DeleteOneParams,
  GetListParams,
  GetManyParams,
  GetOneParams,
  Pagination,
  UpdateParams,
} from '@refinedev/core'
import type { PayloadListResponse } from 'payload-elysia-api/server'

import { payloadApi } from '@/api/edenClient'

type PayloadCollection = 'posts' | 'users'

const API_URL = '/api'

export interface PayloadErrorBody {
  message?: string
  errors?: Array<{ message?: string; field?: string; path?: string }>
}

export type ApiError = Error & {
  statusCode?: number
  payloadErrors?: PayloadErrorBody['errors']
  /** Field-path keyed messages; refine-antd useForm maps these onto Form field errors. */
  errors?: Record<string, string | string[]>
}

const createApiErrorFromTreaty = (statusCode: number, error: unknown): ApiError => {
  const body = (error as { value?: unknown } | null)?.value ?? null
  const errorBody = body as PayloadErrorBody | null
  const firstFieldError = errorBody?.errors?.[0]?.message
  const apiError = new Error(
    firstFieldError ?? errorBody?.message ?? `Payload API error (${statusCode})`,
  ) as ApiError
  apiError.statusCode = statusCode
  // NOTE: refine-antd useForm maps this per-field errors object onto Form field errors.
  const payloadErrors = errorBody?.errors ?? []
  apiError.payloadErrors = payloadErrors
  Object.defineProperty(apiError, 'errors', {
    value: Object.fromEntries(
      payloadErrors
        .filter((payloadError) => payloadError.path ?? payloadError.field)
        .map((payloadError) => [
          payloadError.path ?? payloadError.field,
          payloadError.message ?? 'Invalid value',
        ]),
    ),
  })
  return apiError
}

interface TreatyResult<TData> {
  data: TData | null
  error: unknown
  status: number
}

const requireData = <TData>(result: TreatyResult<TData>): TData => {
  if (!result.data) {
    throw createApiErrorFromTreaty(result.status, result.error)
  }
  return result.data
}

// NOTE: Eden treaty types model :param routes as CreateParams callables, but at runtime only
// index access substitutes the actual id (observed on @elysiajs/eden 1.4.9). These narrow
// accessors are the single cast boundary each while keeping end-to-end typing of the route.
const postsDocumentRoute = (postId: string): ReturnType<typeof payloadApi.posts> =>
  (payloadApi.posts as unknown as Record<string, ReturnType<typeof payloadApi.posts>>)[postId]
const usersDocumentRoute = (userId: string): ReturnType<typeof payloadApi.users> =>
  (payloadApi.users as unknown as Record<string, ReturnType<typeof payloadApi.users>>)[userId]

const documentQueryOptions = { query: { depth: '0' } }

interface CollectionQuery {
  limit: number
  page: number
  depth: string
  sort?: string
  where?: string
}

const payloadOperatorByRefineOperator: Partial<Record<CrudOperators, string>> = {
  eq: 'equals',
  ne: 'not_equals',
  eqs: 'equals',
  nes: 'not_equals',
  lt: 'less_than',
  lte: 'less_than_equal',
  gt: 'greater_than',
  gte: 'greater_than_equal',
  in: 'in',
  nin: 'not_in',
  ina: 'in',
  nina: 'not_in',
  contains: 'contains',
  containss: 'contains',
  ncontains: 'not_like',
  ncontainss: 'not_like',
  startswith: 'like',
  startswiths: 'like',
  nstartswith: 'not_like',
  nstartswiths: 'not_like',
  endswith: 'like',
  endswiths: 'like',
  nendswith: 'not_like',
  nendswiths: 'not_like',
}

type PayloadWhereCondition = Record<string, unknown>

const buildPayloadConditionFromFilter = (filter: CrudFilter): PayloadWhereCondition | undefined => {
  if ('field' in filter) {
    if (filter.value === undefined || filter.value === null || filter.value === '') {
      return undefined
    }
    if (filter.operator === 'null' || filter.operator === 'nnull') {
      const payloadOperator = filter.operator === 'null' ? 'equals' : 'not_equals'
      return { [filter.field]: { [payloadOperator]: null } }
    }
    const payloadOperator = payloadOperatorByRefineOperator[filter.operator]
    if (!payloadOperator) {
      console.warn(
        `Payload data provider: unsupported refine operator "${filter.operator}" ignored`,
      )
      return undefined
    }
    return { [filter.field]: { [payloadOperator]: filter.value } }
  }

  // Conditional and/or filters map 1:1 onto Payload's where and/or groups.
  const nestedConditions = filter.value
    .map(buildPayloadConditionFromFilter)
    .filter((condition): condition is PayloadWhereCondition => condition !== undefined)
  if (nestedConditions.length === 0) {
    return undefined
  }
  return { [filter.operator]: nestedConditions }
}

const buildPayloadWhereFromFilters = (filters: CrudFilters = []): string | undefined => {
  const conditions = filters
    .map(buildPayloadConditionFromFilter)
    .filter((condition): condition is PayloadWhereCondition => condition !== undefined)
  return conditions.length > 0 ? JSON.stringify({ and: conditions }) : undefined
}

const buildSortParam = (sorters: CrudSorting = []): string | undefined => {
  if (sorters.length === 0) {
    return undefined
  }
  return sorters.map(({ field, order }) => (order === 'desc' ? `-${field}` : field)).join(',')
}

const buildCollectionQuery = (
  pagination: Pagination | undefined,
  sorters: CrudSorting | undefined,
  filters: CrudFilters | undefined,
): CollectionQuery => {
  const sortQuery = buildSortParam(sorters ?? [])
  const whereQuery = buildPayloadWhereFromFilters(filters ?? [])
  return {
    limit: pagination?.pageSize ?? 10,
    page: pagination?.currentPage ?? 1,
    depth: '0',
    ...(sortQuery ? { sort: sortQuery } : {}),
    ...(whereQuery ? { where: whereQuery } : {}),
  }
}

const fetchCollectionList = async (
  collection: PayloadCollection,
  query: CollectionQuery,
): Promise<PayloadListResponse<Array<Record<string, unknown>>>> => {
  if (collection === 'posts') {
    return requireData(await payloadApi.posts.get({ query })) as unknown as PayloadListResponse<
      Array<Record<string, unknown>>
    >
  }
  return requireData(await payloadApi.users.get({ query })) as unknown as PayloadListResponse<
    Array<Record<string, unknown>>
  >
}

export const createPayloadDataProvider = (): DataProvider => ({
  getApiUrl: () => API_URL,

  getList: async <TData extends BaseRecord = BaseRecord>({
    resource,
    pagination,
    sorters,
    filters,
  }: GetListParams) => {
    const list = await fetchCollectionList(
      resource as PayloadCollection,
      buildCollectionQuery(pagination, sorters, filters),
    )
    return {
      data: (list.docs as unknown as TData[]) ?? [],
      total: list.totalDocs ?? 0,
    }
  },

  getMany: async <TData extends BaseRecord = BaseRecord>({ resource, ids }: GetManyParams) => {
    const list = await fetchCollectionList(resource as PayloadCollection, {
      where: JSON.stringify({ id: { in: ids } }),
      limit: ids.length,
      page: 1,
      depth: '0',
    })
    return { data: (list.docs as unknown as TData[]) ?? [] }
  },

  getOne: async <TData extends BaseRecord = BaseRecord>({ resource, id }: GetOneParams) => {
    if (resource === 'posts') {
      const doc = requireData(await postsDocumentRoute(String(id)).get(documentQueryOptions))
      return { data: doc as unknown as TData }
    }
    const doc = requireData(await usersDocumentRoute(String(id)).get(documentQueryOptions))
    return { data: doc as unknown as TData }
  },

  create: async <TData extends BaseRecord = BaseRecord, TVariables = Record<string, unknown>>({
    resource,
    variables,
  }: CreateParams<TVariables>) => {
    if (resource === 'posts') {
      const response = requireData(
        await payloadApi.posts.post(
          variables as unknown as { title: string; slug: string },
          documentQueryOptions,
        ),
      )
      return { data: response.doc as unknown as TData }
    }
    const response = requireData(
      await payloadApi.users.post(
        variables as unknown as { email: string; password: string },
        documentQueryOptions,
      ),
    )
    return { data: response.doc as unknown as TData }
  },

  update: async <TData extends BaseRecord = BaseRecord, TVariables = Record<string, unknown>>({
    resource,
    id,
    variables,
  }: UpdateParams<TVariables>) => {
    if (resource === 'posts') {
      const response = requireData(
        await postsDocumentRoute(String(id)).patch(
          variables as unknown as { title?: string; slug?: string },
          documentQueryOptions,
        ),
      )
      return { data: response.doc as unknown as TData }
    }
    const response = requireData(
      await usersDocumentRoute(String(id)).patch(
        variables as unknown as { email?: string; password?: string },
        documentQueryOptions,
      ),
    )
    return { data: response.doc as unknown as TData }
  },

  deleteOne: async <TData extends BaseRecord = BaseRecord, TVariables = Record<string, unknown>>({
    resource,
    id,
  }: DeleteOneParams<TVariables>) => {
    if (resource === 'posts') {
      const response = requireData(
        await postsDocumentRoute(String(id)).delete(undefined, documentQueryOptions),
      )
      return { data: response.doc as unknown as TData }
    }
    const response = requireData(
      await usersDocumentRoute(String(id)).delete(undefined, documentQueryOptions),
    )
    return { data: response.doc as unknown as TData }
  },

  deleteMany: async <TData extends BaseRecord = BaseRecord, TVariables = Record<string, unknown>>({
    resource,
    ids,
  }: DeleteManyParams<TVariables>) => {
    const results = await Promise.allSettled(
      ids.map(async (id): Promise<TData> => {
        if (resource === 'posts') {
          return requireData(
            await postsDocumentRoute(String(id)).delete(undefined, documentQueryOptions),
          ).doc as unknown as TData
        }
        return requireData(
          await usersDocumentRoute(String(id)).delete(undefined, documentQueryOptions),
        ).doc as unknown as TData
      }),
    )
    const docs = results
      .filter(
        (result): result is PromiseFulfilledResult<Awaited<TData>> => result.status === 'fulfilled',
      )
      .map((result) => result.value as TData)
    return { data: docs }
  },
})
