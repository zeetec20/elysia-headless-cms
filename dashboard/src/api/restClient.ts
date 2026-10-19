import createClient from 'openapi-fetch'
import type { paths } from './schema'

const dashboardOrigin =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'

export const apiClient = createClient<paths>({
  baseUrl: dashboardOrigin,
})
