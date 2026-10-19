import type { PayloadPostsStats } from '@/types'
import { apiClient } from '../restClient'

const extractStatsErrorMessage = (error: unknown, status: number): string => {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return `Stats request failed (${status})`
}

export const fetchPostsStats = async (): Promise<PayloadPostsStats> => {
  const { data, error, response } = await apiClient.GET('/api/posts/stats', {})
  if (!data?.data) {
    throw new Error(extractStatsErrorMessage(error, response.status))
  }
  return data.data
}
