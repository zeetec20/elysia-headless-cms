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

export const requestPayloadApi = async (
  url: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> => {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as PayloadErrorBody | null
    const firstFieldError = errorBody?.errors?.[0]?.message
    const error = new Error(
      firstFieldError ?? errorBody?.message ?? response.statusText,
    ) as ApiError
    error.statusCode = response.status
    // NOTE: refine-antd useForm maps this per-field errors object onto Form field errors.
    const payloadErrors = errorBody?.errors ?? []
    error.payloadErrors = payloadErrors
    Object.defineProperty(error, 'errors', {
      value: Object.fromEntries(
        payloadErrors
          .filter((payloadError) => payloadError.path ?? payloadError.field)
          .map((payloadError) => [
            payloadError.path ?? payloadError.field,
            payloadError.message ?? 'Invalid value',
          ]),
      ),
    })
    throw error
  }
  return (await response.json()) as Record<string, unknown>
}

// NOTE: Payload REST /api/users/me returns 200 with user:null when no valid session exists;
// every auth flow must treat a null user as unauthenticated, not rely on the status code.
export const fetchCurrentUser = async (): Promise<Record<string, unknown> | null> => {
  const json = await requestPayloadApi('/api/users/me')
  return (json.user ?? null) as Record<string, unknown> | null
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

const buildListQuery = (
  resource: string,
  pagination: Pagination | undefined,
  sorters: CrudSorting | undefined,
  filters: CrudFilters | undefined,
): string => {
  const params = new URLSearchParams()
  params.set('limit', String(pagination?.pageSize ?? 10))
  params.set('page', String(pagination?.currentPage ?? 1))
  params.set('depth', '0')
  const sortQuery = buildSortParam(sorters ?? [])
  if (sortQuery) {
    params.set('sort', sortQuery)
  }
  const whereQuery = buildPayloadWhereFromFilters(filters ?? [])
  if (whereQuery) {
    params.set('where', whereQuery)
  }
  return `/${resource}?${params.toString()}`
}

export const createPayloadDataProvider = (): DataProvider => ({
  getApiUrl: () => API_URL,

  getList: async <TData extends BaseRecord = BaseRecord>({
    resource,
    pagination,
    sorters,
    filters,
  }: GetListParams) => {
    const json = await requestPayloadApi(
      `${API_URL}${buildListQuery(resource, pagination, sorters, filters)}`,
    )
    return {
      data: (json.docs as TData[]) ?? [],
      total: (json.totalDocs as number) ?? 0,
    }
  },

  getMany: async <TData extends BaseRecord = BaseRecord>({ resource, ids }: GetManyParams) => {
    const whereQuery = JSON.stringify({ id: { in: ids } })
    const json = await requestPayloadApi(
      `${API_URL}/${resource}?where=${encodeURIComponent(whereQuery)}&limit=${ids.length}&depth=0`,
    )
    return { data: (json.docs as TData[]) ?? [] }
  },

  getOne: async <TData extends BaseRecord = BaseRecord>({ resource, id }: GetOneParams) => {
    const json = await requestPayloadApi(`${API_URL}/${resource}/${encodeURI(String(id))}?depth=0`)
    // NOTE: REST getOne returns the document directly; create/update/delete wrap it in { doc }.
    return { data: (json.doc as TData) ?? (json as unknown as TData) }
  },

  create: async <TData extends BaseRecord = BaseRecord, TVariables = Record<string, unknown>>({
    resource,
    variables,
  }: CreateParams<TVariables>) => {
    const json = await requestPayloadApi(`${API_URL}/${resource}?depth=0`, {
      method: 'POST',
      body: JSON.stringify(variables),
    })
    return { data: json.doc as TData }
  },

  update: async <TData extends BaseRecord = BaseRecord, TVariables = Record<string, unknown>>({
    resource,
    id,
    variables,
  }: UpdateParams<TVariables>) => {
    const json = await requestPayloadApi(
      `${API_URL}/${resource}/${encodeURI(String(id))}?depth=0`,
      {
        method: 'PATCH',
        body: JSON.stringify(variables),
      },
    )
    return { data: json.doc as TData }
  },

  deleteOne: async <TData extends BaseRecord = BaseRecord, TVariables = Record<string, unknown>>({
    resource,
    id,
  }: DeleteOneParams<TVariables>) => {
    const json = await requestPayloadApi(
      `${API_URL}/${resource}/${encodeURI(String(id))}?depth=0`,
      { method: 'DELETE' },
    )
    return { data: json.doc as TData }
  },

  deleteMany: async <TData extends BaseRecord = BaseRecord, TVariables = Record<string, unknown>>({
    resource,
    ids,
  }: DeleteManyParams<TVariables>) => {
    const results = await Promise.allSettled(
      ids.map((id) =>
        requestPayloadApi(`${API_URL}/${resource}/${encodeURI(String(id))}?depth=0`, {
          method: 'DELETE',
        }),
      ),
    )
    const docs = results
      .filter(
        (result): result is PromiseFulfilledResult<Record<string, unknown>> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value.doc as TData)
    return { data: docs }
  },
})
