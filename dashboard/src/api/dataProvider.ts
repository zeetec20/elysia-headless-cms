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
import type { PayloadListResponse } from '@/types'
import { getStoredAuthToken } from './auth/authToken'
import { resolvedApiBaseUrl } from './restClient'

const API_URL = '/api'

const getBaseUrl = (): string => resolvedApiBaseUrl.replace(/\/$/, '')

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

const createApiError = (statusCode: number, errorBody: unknown): ApiError => {
  let message: string | undefined
  let payloadErrors: Array<{
    message?: string
    field?: string
    path?: string
  }> = []

  if (errorBody && typeof errorBody === 'object') {
    if ('message' in errorBody && typeof errorBody.message === 'string') {
      message = errorBody.message
    }
    if ('errors' in errorBody && Array.isArray(errorBody.errors)) {
      payloadErrors = errorBody.errors.filter(
        (err): err is { message?: string; field?: string; path?: string } =>
          err !== null && typeof err === 'object',
      )
    }
  }

  const firstFieldError = payloadErrors[0]?.message
  const apiError = new Error(
    firstFieldError ?? message ?? `Payload API error (${statusCode})`,
  ) as ApiError
  apiError.statusCode = statusCode
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

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const token = getStoredAuthToken()
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(url, {
    ...init,
    headers,
  })
  const body = (await response.json().catch(() => null)) as unknown
  if (!response.ok) {
    throw createApiError(response.status, body)
  }
  return body as T
}

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

const buildQueryString = (query: CollectionQuery): string => {
  const searchParams = new URLSearchParams()
  searchParams.set('limit', String(query.limit))
  searchParams.set('page', String(query.page))
  searchParams.set('depth', String(query.depth))
  if (query.sort) {
    searchParams.set('sort', query.sort)
  }
  if (query.where) {
    searchParams.set('where', query.where)
  }
  return searchParams.toString()
}

export const createPayloadDataProvider = (): DataProvider => ({
  getApiUrl: () => API_URL,

  getList: async <TData extends BaseRecord = BaseRecord>({
    resource,
    pagination,
    sorters,
    filters,
  }: GetListParams) => {
    const query = buildCollectionQuery(pagination, sorters, filters)
    const queryString = buildQueryString(query)
    const list = await requestJson<PayloadListResponse<TData>>(
      `${getBaseUrl()}/api/${resource}?${queryString}`,
    )
    return {
      data: list.docs ?? [],
      total: list.totalDocs ?? 0,
    }
  },

  getMany: async <TData extends BaseRecord = BaseRecord>({ resource, ids }: GetManyParams) => {
    const query: CollectionQuery = {
      where: JSON.stringify({ id: { in: ids } }),
      limit: ids.length,
      page: 1,
      depth: '0',
    }
    const queryString = buildQueryString(query)
    const list = await requestJson<PayloadListResponse<TData>>(
      `${getBaseUrl()}/api/${resource}?${queryString}`,
    )
    return { data: list.docs ?? [] }
  },

  getOne: async <TData extends BaseRecord = BaseRecord>({ resource, id }: GetOneParams) => {
    const doc = await requestJson<TData>(
      `${getBaseUrl()}/api/${resource}/${encodeURIComponent(String(id))}?depth=0`,
    )
    return { data: doc }
  },

  create: async <TData extends BaseRecord = BaseRecord, TVariables = Record<string, unknown>>({
    resource,
    variables,
  }: CreateParams<TVariables>) => {
    const response = await requestJson<{ doc: TData }>(`${getBaseUrl()}/api/${resource}?depth=0`, {
      method: 'POST',
      body: JSON.stringify(variables),
    })
    return { data: response.doc }
  },

  update: async <TData extends BaseRecord = BaseRecord, TVariables = Record<string, unknown>>({
    resource,
    id,
    variables,
  }: UpdateParams<TVariables>) => {
    const response = await requestJson<{ doc: TData }>(
      `${getBaseUrl()}/api/${resource}/${encodeURIComponent(String(id))}?depth=0`,
      {
        method: 'PATCH',
        body: JSON.stringify(variables),
      },
    )
    return { data: response.doc }
  },

  deleteOne: async <TData extends BaseRecord = BaseRecord, TVariables = Record<string, unknown>>({
    resource,
    id,
  }: DeleteOneParams<TVariables>) => {
    const response = await requestJson<{ doc: TData }>(
      `${getBaseUrl()}/api/${resource}/${encodeURIComponent(String(id))}?depth=0`,
      {
        method: 'DELETE',
      },
    )
    return { data: response.doc }
  },

  deleteMany: async <TData extends BaseRecord = BaseRecord, TVariables = Record<string, unknown>>({
    resource,
    ids,
  }: DeleteManyParams<TVariables>) => {
    const results = await Promise.allSettled(
      ids.map(async (id): Promise<TData> => {
        const response = await requestJson<{ doc: TData }>(
          `${getBaseUrl()}/api/${resource}/${encodeURIComponent(String(id))}?depth=0`,
          {
            method: 'DELETE',
          },
        )
        return response.doc
      }),
    )
    const docs = results
      .filter(
        (result): result is PromiseFulfilledResult<Awaited<TData>> => result.status === 'fulfilled',
      )
      .map((result) => result.value)
    return { data: docs }
  },
})
