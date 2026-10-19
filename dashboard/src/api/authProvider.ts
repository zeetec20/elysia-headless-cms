import type { AuthProvider } from '@refinedev/core'
import type { PayloadMeResponse } from 'payload-elysia-api/server'
import { invalidateIdentityCache } from '@/api/accessControl'
import type { PayloadErrorBody } from '@/api/dataProvider'
import { payloadApi } from '@/api/edenClient'

const fetchCurrentUser = async (): Promise<PayloadMeResponse['user']> => {
  const response = requireUserResponse(await payloadApi.users.me.get())
  return response.user
}

const requireUserResponse = (result: {
  data: PayloadMeResponse | null
  error: unknown
  status: number
}): PayloadMeResponse => {
  if (!result.data) {
    throw createSessionError(result.status, result.error)
  }
  return result.data
}

const createSessionError = (statusCode: number, error: unknown): Error => {
  const body = (error as { value?: PayloadErrorBody } | null)?.value
  const sessionError = new Error(body?.message ?? 'Session request failed') as Error & {
    statusCode?: number
  }
  sessionError.statusCode = statusCode
  return sessionError
}

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    try {
      const login = await payloadApi.users.login.post({ email, password })
      if (!login.data) {
        throw createSessionError(login.status, login.error)
      }
      // NOTE: Only superadmin accounts may use the dashboard; guests keep REST/registration
      // semantics server-side. Clear the just-set cookie so the rejected session does not linger.
      if (login.data.user.role !== 'superadmin') {
        await payloadApi.users.logout.post().catch(() => undefined)
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
    await payloadApi.users.logout.post().catch(
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
    const statusCode = (error as { statusCode?: number })?.statusCode
    // NOTE: 403 is an access-control denial and must keep the session; only 401 means the
    // session itself is gone and logging out is correct.
    if (statusCode === 401) {
      return { logout: true, redirectTo: '/login', error }
    }
    return {}
  },
}
