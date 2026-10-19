import type { AuthProvider } from '@refinedev/core'
import { requestPayloadApi } from './dataProvider'

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    try {
      await requestPayloadApi('/api/users/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
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
      await requestPayloadApi('/api/users/me')
      return { authenticated: true }
    } catch {
      return { authenticated: false, logout: true, redirectTo: '/login' }
    }
  },

  logout: async () => {
    try {
      await requestPayloadApi('/api/users/logout', { method: 'POST' })
    } catch {
      // Best-effort logout; clearing happens server-side, a failed call still ends the session.
    }
    return { success: true, redirectTo: '/login' }
  },

  getIdentity: async () => {
    const json = await requestPayloadApi('/api/users/me')
    const user = (json.user ?? null) as Record<string, unknown> | null
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
    const json = await requestPayloadApi('/api/users/me')
    const user = (json.user ?? null) as Record<string, unknown> | null
    return user?.role ?? null
  },

  onError: async (error) => {
    const statusCode = (error as { statusCode?: number })?.statusCode
    if (statusCode === 401 || statusCode === 403) {
      return { logout: statusCode === 401, redirectTo: '/login', error: new Error('Forbidden') }
    }
    return {}
  },
}
