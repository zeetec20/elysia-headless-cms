import type { User } from '../payload-types'

export type { ApiErrorResponse, ApiResponse, ApiSuccessResponse } from '../utils/apiResponseUtils'

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
