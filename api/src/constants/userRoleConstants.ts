/** NOTE: Role values allowed by the users collection `role` field. */
export const SUPERADMIN_USER_ROLE = 'superadmin'
export const GUEST_USER_ROLE = 'guest'

export type UserRole = typeof SUPERADMIN_USER_ROLE | typeof GUEST_USER_ROLE
