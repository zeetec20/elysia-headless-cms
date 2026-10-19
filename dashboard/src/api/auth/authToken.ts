const AUTH_TOKEN_KEY = 'payload-token'

export const getStoredAuthToken = (): string | null => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  return window.localStorage.getItem(AUTH_TOKEN_KEY)
}

export const setStoredAuthToken = (token: string): void => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  window.localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export const removeStoredAuthToken = (): void => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
}
