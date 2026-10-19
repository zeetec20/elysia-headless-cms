export interface ApiSuccessResponse<T> {
  success: true
  data: T
}

export interface ApiErrorResponse {
  success: false
  error: string
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

export const createApiSuccessResponse = <T>(
  data: T,
  status = 200,
  headers?: HeadersInit,
): Response => {
  return Response.json(
    {
      success: true,
      data,
    },
    { status, headers },
  )
}

export const createApiErrorResponse = (
  error: string,
  status = 500,
  headers?: HeadersInit,
): Response => {
  return Response.json(
    {
      success: false,
      error,
    },
    { status, headers },
  )
}
