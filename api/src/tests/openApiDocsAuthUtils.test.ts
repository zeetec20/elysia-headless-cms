import { describe, expect, it } from 'bun:test'
import { pbkdf2 } from 'node:crypto'
import { verifyPayloadUserPasswordHash } from '@/utils/openApiDocsAuthUtils'

const PASSWORD_SALT = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const PASSWORD = 'super-secret123'

const derivePasswordHash = (
  password: string,
  salt: string,
  iterations: number,
  keyLength: number,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, keyLength, 'sha256', (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }

      resolve(derivedKey.toString('hex'))
    })
  })
}

describe('OpenAPI docs password verification', () => {
  it('verifies a current Payload password hash', async () => {
    const hash = `pbkdf2-sha256-v1:${await derivePasswordHash(PASSWORD, PASSWORD_SALT, 600_000, 32)}`

    expect(await verifyPayloadUserPasswordHash({ hash, salt: PASSWORD_SALT }, PASSWORD)).toBe(true)
    expect(
      await verifyPayloadUserPasswordHash({ hash, salt: PASSWORD_SALT }, 'wrong-password'),
    ).toBe(false)
  })

  it('verifies a legacy Payload password hash', async () => {
    const hash = await derivePasswordHash(PASSWORD, PASSWORD_SALT, 25_000, 512)

    expect(await verifyPayloadUserPasswordHash({ hash, salt: PASSWORD_SALT }, PASSWORD)).toBe(true)
  })

  it('rejects users without a stored hash or salt', async () => {
    expect(await verifyPayloadUserPasswordHash({}, PASSWORD)).toBe(false)
    expect(await verifyPayloadUserPasswordHash({ hash: 'pbkdf2-sha256-v1:abcd' }, PASSWORD)).toBe(
      false,
    )
  })
})
