const AUTH_TOKEN_KEY = 'payload-token'

const getDashboardSessionStorage = (): Storage | null => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null
  }
  return window.sessionStorage
}

const removeLegacyLocalAuthToken = (): void => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
}

export const getStoredAuthToken = (): string | null => {
  const storage = getDashboardSessionStorage()
  if (!storage) {
    return null
  }
  removeLegacyLocalAuthToken()
  return storage.getItem(AUTH_TOKEN_KEY)
}

export const setStoredAuthToken = (token: string): void => {
  const storage = getDashboardSessionStorage()
  if (!storage) {
    return
  }
  removeLegacyLocalAuthToken()
  storage.setItem(AUTH_TOKEN_KEY, token)
}

export const removeStoredAuthToken = (): void => {
  removeLegacyLocalAuthToken()
  getDashboardSessionStorage()?.removeItem(AUTH_TOKEN_KEY)
}
