import type { AccessControlProvider } from '@refinedev/core'
import { getCachedCurrentUser } from './authState'
export const createPayloadAccessControlProvider = (): AccessControlProvider => ({
  can: async () => {
    const identity = await getCachedCurrentUser()
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
