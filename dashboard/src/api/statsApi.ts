import type { PayloadPostsStats } from '../types'
import { requestPayloadApi } from './dataProvider'

export const fetchPostsStats = async (): Promise<PayloadPostsStats> => {
  // Custom endpoints implemented by the API follow its { success, data } convention.
  const json = await requestPayloadApi('/api/posts/stats')
  return (json.data ?? json) as PayloadPostsStats
}
