import type { CollectionBeforeChangeHook } from 'payload'
import { GUEST_USER_ROLE, SUPERADMIN_USER_ROLE, USERS_COLLECTION_SLUG } from '../constants'
import type { CustomCollectionConfig } from '../utils/endpointAuthUtils'

export const protectUserRoleBeforeChange: CollectionBeforeChangeHook = ({
  data,
  req,
  context,
  operation,
  originalDoc,
}) => {
  const isPrivileged = Boolean(
    req?.user?.role === SUPERADMIN_USER_ROLE ||
      context?.system ||
      context?.seed ||
      req?.context?.system ||
      req?.context?.seed,
  )

  const resolvedRole = (() => {
    if (data.role === SUPERADMIN_USER_ROLE && !isPrivileged) {
      return operation === 'update' ? (originalDoc?.role ?? GUEST_USER_ROLE) : GUEST_USER_ROLE
    }
    if (!data.role && operation === 'create') {
      return GUEST_USER_ROLE
    }
    return data.role
  })()

  if (resolvedRole !== undefined) {
    data.role = resolvedRole
  }

  return data
}

export const Users: CustomCollectionConfig = {
  slug: USERS_COLLECTION_SLUG,
  lockDocuments: false,
  // NOTE: Marks Users as the canonical JWT Bearer-only identity collection (sessions, /login, /me).
  // Cookies and API keys are disabled; content collections like Posts must never define auth.
  auth: {
    useAPIKey: false,
    useSessions: true,
    tokenExpiration: 60 * 60,
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
  },
  // NOTE: Gates /admin and delete to superadmin; public registration allowed; profile read/update scoped to self for guests.
  access: {
    admin: ({ req: { user } }) => user?.role === SUPERADMIN_USER_ROLE,
    read: ({ req: { user } }) =>
      user?.role === SUPERADMIN_USER_ROLE ? true : user ? { id: { equals: user.id } } : false,
    create: () => true,
    update: ({ req: { user } }) =>
      user?.role === SUPERADMIN_USER_ROLE ? true : user ? { id: { equals: user.id } } : false,
    delete: ({ req: { user } }) => user?.role === SUPERADMIN_USER_ROLE,
  },
  // NOTE: Enforces role assignment integrity, forcing guest on self-registration and blocking elevation.
  hooks: {
    beforeChange: [protectUserRoleBeforeChange],
  },
  admin: {
    useAsTitle: 'email',
  },
  fields: [
    // NOTE: Role-based access control field; field-level access prevents non-superadmins from setting or elevating role.
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: GUEST_USER_ROLE,
      options: [
        {
          label: 'Super Admin',
          value: SUPERADMIN_USER_ROLE,
        },
        {
          label: 'Guest',
          value: GUEST_USER_ROLE,
        },
      ],
      access: {
        create: ({ req: { user } }) => user?.role === SUPERADMIN_USER_ROLE,
        update: ({ req: { user } }) => user?.role === SUPERADMIN_USER_ROLE,
      },
    },
  ],
}
