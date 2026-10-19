import createClient from 'openapi-fetch'
import { getStoredAuthToken } from './auth/authToken'
import type { paths } from './schema'

export const resolvedApiBaseUrl =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')

export const apiClient = createClient<paths>({
  baseUrl: resolvedApiBaseUrl,
})

apiClient.use({
  onRequest({ request }) {
    const token = getStoredAuthToken()
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
  },
})
