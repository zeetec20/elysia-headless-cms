import type { AccessControlProvider } from '@refinedev/core'
import { fetchCurrentUser } from './dataProvider'

// NOTE: Cached per browser session lifetime; login/logout invalidate it. undefined means not
// fetched yet, null means the /me probe confirmed there is no session.
let cachedIdentityCache: Record<string, unknown> | null | undefined

export const invalidateIdentityCache = (): void => {
  cachedIdentityCache = undefined
}

const getCachedIdentity = async (): Promise<Record<string, unknown> | null> => {
  if (cachedIdentityCache === undefined) {
    cachedIdentityCache = await fetchCurrentUser().catch(() => null)
  }
  return cachedIdentityCache
}

// NOTE: These rules mirror the server-side Payload access control 1:1 (the server always has
// the final say) so the dashboard hides actions the API would reject — same as the Payload
// admin, which consults /api/access before rendering CRUD affordances.
const resolveGuestAccess = (
  resource: string | undefined,
  action: string,
  params: { id?: unknown } | undefined,
  identity: Record<string, unknown>,
): boolean => {
  if (resource === 'posts') {
    return action === 'list' || action === 'read' || action === 'show'
  }
  if (resource === 'users') {
    if (action === 'list' || action === 'read' || action === 'show') {
      return true
    }
    if (action === 'edit') {
      return String(identity.id) === String(params?.id)
    }
    return false
  }
  return false
}

export const createPayloadAccessControlProvider = (): AccessControlProvider => ({
  can: async ({ resource, action, params }) => {
    const identity = await getCachedIdentity()
    if (!identity) {
      return { can: false, reason: 'Session expired; sign in again' }
    }
    if (identity.role === 'superadmin') {
      return { can: true }
    }
    return { can: resolveGuestAccess(resource, action, params, identity) }
  },
  options: {
    buttons: {
      enableAccessControl: true,
      hideIfUnauthorized: true,
    },
  },
})
