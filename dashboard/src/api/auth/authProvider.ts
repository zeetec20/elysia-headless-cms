import type { AuthProvider } from '@refinedev/core'
import type { PayloadUser } from '@/types'
import { apiClient } from '../restClient'
import { invalidateIdentityCache } from './accessControl'

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

const fetchCurrentUser = async (): Promise<PayloadUser | null> => {
  const { data, error, response } = await apiClient.GET('/api/users/me', {})
  if (!response.ok) {
    throw createSessionError(response.status, error)
  }
  return (data?.user as PayloadUser | undefined) ?? null
}

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    try {
      const { data, error, response } = await apiClient.POST('/api/users/login', {
        body: { email, password },
      })
      if (!data?.user) {
        throw createSessionError(response.status, error)
      }
      // NOTE: Only superadmin accounts may use the dashboard; guests keep REST/registration
      // semantics server-side. Clear the just-set cookie so the rejected session does not linger.
      if (data.user.role !== 'superadmin') {
        await apiClient.POST('/api/users/logout', {}).catch(() => undefined)
        return {
          success: false,
          error: {
            name: 'Login failed',
            message: 'Only superadmin accounts may use the dashboard',
          },
        }
      }
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
      // NOTE: Payload REST /api/users/me returns 200 with user:null when no valid session exists;
      // every auth flow treats a null user as unauthenticated, not by the status code alone.
      if (user?.role !== 'superadmin') {
        return { authenticated: false, logout: true, redirectTo: '/login' }
      }
      return { authenticated: true }
    } catch {
      return { authenticated: false, logout: true, redirectTo: '/login' }
    }
  },

  logout: async () => {
    invalidateIdentityCache()
    await apiClient.POST('/api/users/logout', {}).catch(
      () =>
        // Best-effort logout; the cookie clears server-side, a failed call still ends the session.
        undefined,
    )
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
    const statusCode = extractErrorStatusCode(error)
    // NOTE: 403 is an access-control denial and must keep the session; only 401 means the
    // session itself is gone and logging out is correct.
    if (statusCode === 401) {
      return { logout: true, redirectTo: '/login', error }
    }
    return {}
  },
}
