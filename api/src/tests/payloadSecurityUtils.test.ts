import { describe, expect, it } from 'bun:test'
import {
  resolveInitialAdminCredentials,
  resolvePayloadAuthSecret,
} from '@/utils/payloadSecurityUtils'

describe('Payload Security Utils', () => {
  it('rejects a missing secret', () => {
    expect(() => resolvePayloadAuthSecret({})).toThrow('PAYLOAD_SECRET must be set')
  })

  it('rejects a configured secret shorter than 32 characters', () => {
    expect(() => resolvePayloadAuthSecret({ PAYLOAD_SECRET: 'too-short' })).toThrow(
      'PAYLOAD_SECRET must be at least 32 characters long',
    )
  })

  it('returns a configured secret', () => {
    const secret = 'a'.repeat(32)

    expect(resolvePayloadAuthSecret({ PAYLOAD_SECRET: secret })).toBe(secret)
  })

  it('requires explicit admin credentials', () => {
    expect(resolveInitialAdminCredentials({})).toBeNull()
    expect(resolveInitialAdminCredentials({ INITIAL_ADMIN_EMAIL: 'ops@example.com' })).toBeNull()
  })

  it('returns the configured admin credentials', () => {
    expect(
      resolveInitialAdminCredentials({
        INITIAL_ADMIN_EMAIL: 'ops@example.com',
        INITIAL_ADMIN_PASSWORD: 'a-strong-password',
      }),
    ).toEqual({
      email: 'ops@example.com',
      password: 'a-strong-password',
    })
  })
})
