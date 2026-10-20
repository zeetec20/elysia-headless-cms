import type { CollectionBeforeChangeHook } from 'payload'
import type { CustomCollectionConfig } from '../utils/endpointAuthUtils'

export const protectUserRoleBeforeChange: CollectionBeforeChangeHook = ({
  data,
  req,
  context,
  operation,
  originalDoc,
}) => {
  const isPrivileged = Boolean(
    req?.user?.role === 'superadmin' ||
      context?.system ||
      context?.seed ||
      req?.context?.system ||
      req?.context?.seed,
  )

  const resolvedRole = (() => {
    if (data.role === 'superadmin' && !isPrivileged) {
      return operation === 'update' ? (originalDoc?.role ?? 'guest') : 'guest'
    }
    if (!data.role && operation === 'create') {
      return 'guest'
    }
    return data.role
  })()

  if (resolvedRole !== undefined) {
    data.role = resolvedRole
  }

  return data
}

export const Users: CustomCollectionConfig = {
  slug: 'users',
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
    admin: ({ req: { user } }) => user?.role === 'superadmin',
    read: ({ req: { user } }) =>
      user?.role === 'superadmin' ? true : user ? { id: { equals: user.id } } : false,
    create: () => true,
    update: ({ req: { user } }) =>
      user?.role === 'superadmin' ? true : user ? { id: { equals: user.id } } : false,
    delete: ({ req: { user } }) => user?.role === 'superadmin',
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
      defaultValue: 'guest',
      options: [
        {
          label: 'Super Admin',
          value: 'superadmin',
        },
        {
          label: 'Guest',
          value: 'guest',
        },
      ],
      access: {
        create: ({ req: { user } }) => user?.role === 'superadmin',
        update: ({ req: { user } }) => user?.role === 'superadmin',
      },
    },
  ],
}
