import type { AuthProvider } from '@refinedev/core'
import { fetchCurrentUser, requestPayloadApi } from './dataProvider'
import { invalidateIdentityCache } from './accessControl'

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    try {
      await requestPayloadApi('/api/users/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      invalidateIdentityCache()
      return { success: true, redirectTo: '/' }
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'Login failed',
          message: error instanceof Error ? error.message : 'Invalid email or password',
        },
      }
    }
  },

  check: async () => {
    try {
      const user = await fetchCurrentUser()
      if (!user) {
        return { authenticated: false, logout: true, redirectTo: '/login' }
      }
      return { authenticated: true }
    } catch {
      return { authenticated: false, logout: true, redirectTo: '/login' }
    }
  },

  logout: async () => {
    invalidateIdentityCache()
    try {
      await requestPayloadApi('/api/users/logout', { method: 'POST' })
    } catch {
      // Best-effort logout; clearing happens server-side, a failed call still ends the session.
    }
    return { success: true, redirectTo: '/login' }
  },

  getIdentity: async () => {
    const user = await fetchCurrentUser()
    if (!user) {
      throw new Error('User is not authenticated')
    }
    return {
      id: String(user.id),
      fullName: String(user.email),
      email: String(user.email),
      role: user.role,
    }
  },

  getPermissions: async () => {
    const user = await fetchCurrentUser()
    if (!user) {
      throw new Error('User is not authenticated')
    }
    return user.role
  },

  onError: async (error) => {
    const statusCode = (error as { statusCode?: number })?.statusCode
    // NOTE: 403 is an access-control denial (e.g. guest hitting a superadmin action) and must
    // keep the session; only 401 means the session itself is gone and logging out is correct.
    if (statusCode === 401) {
      return { logout: true, redirectTo: '/login', error }
    }
    return {}
  },
}
