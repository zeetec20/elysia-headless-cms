import type { AccessControlProvider } from '@refinedev/core'
import type { PayloadUser } from '@/types'
import { apiClient } from '../restClient'

// NOTE: Single-flight promise cache for the browser session lifetime; login/logout invalidates
// it. A failed or anonymous /me probe resolves null so access decisions deny instead of throwing.
let cachedIdentityPromise: Promise<PayloadUser | null> | undefined

export const invalidateIdentityCache = (): void => {
  cachedIdentityPromise = undefined
}

const getCachedIdentity = (): Promise<PayloadUser | null> => {
  cachedIdentityPromise ??= apiClient
    .GET('/api/users/me', {})
    .then((result) => (result.data?.user as PayloadUser | undefined) ?? null)
    .catch(() => null)
  return cachedIdentityPromise
}

export const createPayloadAccessControlProvider = (): AccessControlProvider => ({
  can: async () => {
    const identity = await getCachedIdentity()
    if (!identity) {
      return { can: false, reason: 'Session expired; sign in again' }
    }
    // NOTE: The dashboard is superadmin-only (the login gate in authProvider enforces it too);
    // the server always has the final say — these rules only shape the UI affordances.
    if (identity.role !== 'superadmin') {
      return { can: false, reason: 'Only superadmin accounts may use the dashboard' }
    }
    return { can: true }
  },
  options: {
    buttons: {
      enableAccessControl: true,
      hideIfUnauthorized: true,
    },
  },
})
