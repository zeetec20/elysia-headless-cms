import type { AuthProvider } from '@refinedev/core'
import type { PayloadUser } from '@/types'
import { apiClient } from '../restClient'
import {
  clearAuthState,
  getCachedCurrentUser,
  setCachedCurrentUser,
  setStoredAuthToken,
} from './authState'

const extractSessionErrorMessage = (error: unknown): string => {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return 'Session request failed'
}

const extractErrorStatusCode = (error: unknown): number | undefined => {
  if (
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode
  }
  return undefined
}

const createSessionError = (statusCode: number, error: unknown): Error => {
  const message = extractSessionErrorMessage(error)
  const sessionError = new Error(message) as Error & { statusCode?: number }
  sessionError.statusCode = statusCode
  return sessionError
}

// NOTE: Must run before clearAuthState so the request still carries the Bearer token and
// Payload can revoke the server-side session.
const revokeStoredAuthSession = async (): Promise<void> => {
  await apiClient.POST('/api/users/logout', {}).catch(() => undefined)
}

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    try {
      const { data, error, response } = await apiClient.POST('/api/users/login', {
        body: { email, password },
      })
      if (!data?.user || !data?.token) {
        throw createSessionError(response.status, error)
      }
      setStoredAuthToken(data.token)
      if (data.user.role !== 'superadmin') {
        await revokeStoredAuthSession()
        clearAuthState()
        return {
          success: false,
          error: {
            name: 'Login failed',
            message: 'Only superadmin accounts may use the dashboard',
          },
        }
      }
      setCachedCurrentUser(data.user as PayloadUser)
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
      const user = await getCachedCurrentUser()
      if (user?.role !== 'superadmin') {
        return { authenticated: false, logout: true, redirectTo: '/login' }
      }
      return { authenticated: true }
    } catch {
      return { authenticated: false, logout: true, redirectTo: '/login' }
    }
  },

  logout: async () => {
    await revokeStoredAuthSession()
    clearAuthState()
    return { success: true, redirectTo: '/login' }
  },

  getIdentity: async () => {
    const user = await getCachedCurrentUser()
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
    const user = await getCachedCurrentUser()
    if (!user) {
      throw new Error('User is not authenticated')
    }
    return user.role
  },

  onError: async (error) => {
    const statusCode = extractErrorStatusCode(error)
    if (statusCode === 401) {
      clearAuthState()
      return { logout: true, redirectTo: '/login', error }
    }
    return {}
  },
}
