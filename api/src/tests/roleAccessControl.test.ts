import { describe, expect, it } from 'bun:test'
import type { PayloadRequest } from 'payload'
import { Posts } from '@/collections/Posts'
import { protectUserRoleBeforeChange, Users } from '@/collections/Users'
import type { User } from '@/payload-types'

const createMockPayloadRequest = (
  user: { id?: string; email?: string; role?: string } | null = null,
): PayloadRequest =>
  ({
    user,
    headers: new Headers(),
  }) as unknown as PayloadRequest

describe('Users Access Control', () => {
  const superadminUser = { id: 'user-admin', email: 'admin@example.com', role: 'superadmin' }
  const guestUser = { id: 'user-guest', email: 'guest@example.com', role: 'guest' }

  describe('admin access', () => {
    it('grants admin access when user role is superadmin', () => {
      const accessFn = Users.access?.admin as (args: { req: PayloadRequest }) => boolean
      const result = accessFn({ req: createMockPayloadRequest(superadminUser) })
      expect(result).toBe(true)
    })

    it('denies admin access when user role is guest', () => {
      const accessFn = Users.access?.admin as (args: { req: PayloadRequest }) => boolean
      const result = accessFn({ req: createMockPayloadRequest(guestUser) })
      expect(result).toBe(false)
    })

    it('denies admin access when user is null or undefined', () => {
      const accessFn = Users.access?.admin as (args: { req: PayloadRequest }) => boolean
      const nullResult = accessFn({ req: createMockPayloadRequest(null) })
      const undefinedResult = accessFn({ req: createMockPayloadRequest() })
      expect(nullResult).toBe(false)
      expect(undefinedResult).toBe(false)
    })

    it('verifies User type has role property defined', () => {
      const testUser: User = {
        id: 'u-1',
        email: 'test@example.com',
        role: 'guest',
        collection: 'users',
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      }
      expect(testUser.role).toBe('guest')
    })
  })

  describe('read and update access', () => {
    it('allows superadmin to read all users', () => {
      const accessFn = Users.access?.read as (args: { req: PayloadRequest }) => unknown
      const result = accessFn({ req: createMockPayloadRequest(superadminUser) })
      expect(result).toBe(true)
    })

    it('scopes guest user read access to their own document', () => {
      const accessFn = Users.access?.read as (args: { req: PayloadRequest }) => unknown
      const result = accessFn({ req: createMockPayloadRequest(guestUser) })
      expect(result).toEqual({ id: { equals: guestUser.id } })
    })

    it('denies unauthenticated read access to users', () => {
      const accessFn = Users.access?.read as (args: { req: PayloadRequest }) => unknown
      const result = accessFn({ req: createMockPayloadRequest(null) })
      expect(result).toBe(false)
    })

    it('allows superadmin to update any user', () => {
      const accessFn = Users.access?.update as (args: { req: PayloadRequest }) => unknown
      const result = accessFn({ req: createMockPayloadRequest(superadminUser) })
      expect(result).toBe(true)
    })

    it('scopes guest user update access to their own document', () => {
      const accessFn = Users.access?.update as (args: { req: PayloadRequest }) => unknown
      const result = accessFn({ req: createMockPayloadRequest(guestUser) })
      expect(result).toEqual({ id: { equals: guestUser.id } })
    })

    it('denies unauthenticated update access to users', () => {
      const accessFn = Users.access?.update as (args: { req: PayloadRequest }) => unknown
      const result = accessFn({ req: createMockPayloadRequest(null) })
      expect(result).toBe(false)
    })
  })

  describe('create and delete access', () => {
    it('permits public creation for registration', () => {
      const accessFn = Users.access?.create as () => boolean
      const result = accessFn()
      expect(result).toBe(true)
    })

    it('allows superadmin to delete users', () => {
      const accessFn = Users.access?.delete as (args: { req: PayloadRequest }) => boolean
      const result = accessFn({ req: createMockPayloadRequest(superadminUser) })
      expect(result).toBe(true)
    })

    it('denies guest and unauthenticated callers from deleting users', () => {
      const accessFn = Users.access?.delete as (args: { req: PayloadRequest }) => boolean
      const guestResult = accessFn({ req: createMockPayloadRequest(guestUser) })
      const unauthResult = accessFn({ req: createMockPayloadRequest(null) })
      expect(guestResult).toBe(false)
      expect(unauthResult).toBe(false)
    })
  })

  describe('role field-level access', () => {
    const roleField = Users.fields.find((f) => 'name' in f && f.name === 'role') as {
      access?: {
        create?: (args: { req: PayloadRequest }) => boolean
        update?: (args: { req: PayloadRequest }) => boolean
      }
    }

    it('allows only superadmin to set role on create', () => {
      expect(roleField).toBeDefined()
      const createAccess = roleField.access?.create
      expect(createAccess).toBeDefined()

      expect(createAccess?.({ req: createMockPayloadRequest(superadminUser) })).toBe(true)
      expect(createAccess?.({ req: createMockPayloadRequest(guestUser) })).toBe(false)
      expect(createAccess?.({ req: createMockPayloadRequest(null) })).toBe(false)
    })

    it('allows only superadmin to modify role on update', () => {
      expect(roleField).toBeDefined()
      const updateAccess = roleField.access?.update
      expect(updateAccess).toBeDefined()

      expect(updateAccess?.({ req: createMockPayloadRequest(superadminUser) })).toBe(true)
      expect(updateAccess?.({ req: createMockPayloadRequest(guestUser) })).toBe(false)
      expect(updateAccess?.({ req: createMockPayloadRequest(null) })).toBe(false)
    })
  })

  describe('user role protection hook', () => {
    it('forces role to guest when self-registering with superadmin', async () => {
      const result = await protectUserRoleBeforeChange({
        collection: Users as never,
        context: {},
        data: { email: 'attacker@example.com', role: 'superadmin' },
        operation: 'create',
        req: createMockPayloadRequest(null),
      })
      expect(result.role).toBe('guest')
    })

    it('assigns role to guest when self-registering without role', async () => {
      const result = await protectUserRoleBeforeChange({
        collection: Users as never,
        context: {},
        data: { email: 'newguest@example.com' },
        operation: 'create',
        req: createMockPayloadRequest(null),
      })
      expect(result.role).toBe('guest')
    })

    it('assigns superadmin role when executed in system context', async () => {
      const result = await protectUserRoleBeforeChange({
        collection: Users as never,
        context: { system: true },
        data: { email: 'admin@example.com', role: 'superadmin' },
        operation: 'create',
        req: createMockPayloadRequest(null),
      })
      expect(result.role).toBe('superadmin')
    })

    it('assigns superadmin role when executed in seed context', async () => {
      const result = await protectUserRoleBeforeChange({
        collection: Users as never,
        context: { seed: true },
        data: { email: 'admin@example.com', role: 'superadmin' },
        operation: 'create',
        req: createMockPayloadRequest(null),
      })
      expect(result.role).toBe('superadmin')
    })

    it('prevents guest from escalating role to superadmin on update', async () => {
      const result = await protectUserRoleBeforeChange({
        collection: Users as never,
        context: {},
        data: { role: 'superadmin' },
        operation: 'update',
        originalDoc: { id: 'guest-1', role: 'guest' },
        req: createMockPayloadRequest(guestUser),
      })
      expect(result.role).toBe('guest')
    })

    it('allows superadmin to assign superadmin role on update', async () => {
      const result = await protectUserRoleBeforeChange({
        collection: Users as never,
        context: {},
        data: { role: 'superadmin' },
        operation: 'update',
        originalDoc: { id: 'guest-1', role: 'guest' },
        req: createMockPayloadRequest(superadminUser),
      })
      expect(result.role).toBe('superadmin')
    })
  })
})

describe('Posts Access Control', () => {
  const superadminUser = { id: 'user-admin', email: 'admin@example.com', role: 'superadmin' }
  const guestUser = { id: 'user-guest', email: 'guest@example.com', role: 'guest' }

  it('restricts admin access to superadmin only', () => {
    const accessFn = Posts.access?.admin as (args: { req: PayloadRequest }) => boolean
    expect(accessFn({ req: createMockPayloadRequest(superadminUser) })).toBe(true)
    expect(accessFn({ req: createMockPayloadRequest(guestUser) })).toBe(false)
    expect(accessFn({ req: createMockPayloadRequest(null) })).toBe(false)
  })

  it('retains public read access unconditionally', () => {
    const accessFn = Posts.access?.read as () => boolean
    expect(accessFn()).toBe(true)
  })

  it('restricts create access to superadmin only', () => {
    const accessFn = Posts.access?.create as (args: { req: PayloadRequest }) => boolean
    expect(accessFn({ req: createMockPayloadRequest(superadminUser) })).toBe(true)
    expect(accessFn({ req: createMockPayloadRequest(guestUser) })).toBe(false)
    expect(accessFn({ req: createMockPayloadRequest(null) })).toBe(false)
  })

  it('restricts update access to superadmin only', () => {
    const accessFn = Posts.access?.update as (args: { req: PayloadRequest }) => boolean
    expect(accessFn({ req: createMockPayloadRequest(superadminUser) })).toBe(true)
    expect(accessFn({ req: createMockPayloadRequest(guestUser) })).toBe(false)
    expect(accessFn({ req: createMockPayloadRequest(null) })).toBe(false)
  })

  it('restricts delete access to superadmin only', () => {
    const accessFn = Posts.access?.delete as (args: { req: PayloadRequest }) => boolean
    expect(accessFn({ req: createMockPayloadRequest(superadminUser) })).toBe(true)
    expect(accessFn({ req: createMockPayloadRequest(guestUser) })).toBe(false)
    expect(accessFn({ req: createMockPayloadRequest(null) })).toBe(false)
  })
})
