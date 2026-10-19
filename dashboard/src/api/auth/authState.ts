import type { PayloadUser } from '@/types'
import { apiClient } from '../restClient'

import { getStoredAuthToken, removeStoredAuthToken, setStoredAuthToken } from './authToken'

export { getStoredAuthToken, removeStoredAuthToken, setStoredAuthToken }

let cachedCurrentUser: PayloadUser | null = null
let inflightCurrentUserPromise: Promise<PayloadUser | null> | null = null

export const setCachedCurrentUser = (user: PayloadUser | null): void => {
  cachedCurrentUser = user
}

export const clearAuthState = (): void => {
  removeStoredAuthToken()
  cachedCurrentUser = null
  inflightCurrentUserPromise = null
}

export const getCachedCurrentUser = async (): Promise<PayloadUser | null> => {
  const token = getStoredAuthToken()
  if (!token) {
    cachedCurrentUser = null
    return null
  }

  if (cachedCurrentUser) {
    return cachedCurrentUser
  }

  if (inflightCurrentUserPromise) {
    return inflightCurrentUserPromise
  }

  inflightCurrentUserPromise = (async () => {
    try {
      const { data, response } = await apiClient.GET('/api/users/me', {})
      if (!response.ok || !data?.user) {
        clearAuthState()
        return null
      }

      const user = data.user as PayloadUser
      cachedCurrentUser = user
      return user
    } catch {
      clearAuthState()
      return null
    } finally {
      inflightCurrentUserPromise = null
    }
  })()

  return inflightCurrentUserPromise
}
