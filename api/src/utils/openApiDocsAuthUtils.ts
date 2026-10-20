import { pbkdf2, timingSafeEqual } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'

import {
  HTTP_BASIC_AUTH_SCHEME,
  PAYLOAD_LEGACY_PASSWORD_HASH_ITERATIONS,
  PAYLOAD_LEGACY_PASSWORD_HASH_KEY_LENGTH,
  PAYLOAD_PASSWORD_HASH_ITERATIONS,
  PAYLOAD_PASSWORD_HASH_KEY_LENGTH,
  PAYLOAD_PASSWORD_HASH_PREFIX,
  SUPERADMIN_USER_ROLE,
  USERS_COLLECTION_SLUG,
} from '../constants'

export interface OpenApiDocsBasicCredentials {
  email: string
  password: string
}

interface PayloadPasswordUser {
  hash?: string
  id: number | string
  role?: string
  salt?: string
}

const derivePayloadPasswordHash = (
  password: string,
  salt: string,
  iterations: number,
  keyLength: number,
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, keyLength, 'sha256', (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }

      resolve(derivedKey)
    })
  })
}

export const verifyPayloadUserPasswordHash = async (
  user: Pick<PayloadPasswordUser, 'hash' | 'salt'>,
  candidatePassword: string,
): Promise<boolean> => {
  if (!user.hash || !user.salt) {
    return false
  }

  const isCurrentHash = user.hash.startsWith(PAYLOAD_PASSWORD_HASH_PREFIX)
  const storedHash = Buffer.from(
    isCurrentHash ? user.hash.slice(PAYLOAD_PASSWORD_HASH_PREFIX.length) : user.hash,
    'hex',
  )
  const keyLength = isCurrentHash
    ? PAYLOAD_PASSWORD_HASH_KEY_LENGTH
    : PAYLOAD_LEGACY_PASSWORD_HASH_KEY_LENGTH

  if (storedHash.length !== keyLength) {
    return false
  }

  const derivedHash = await derivePayloadPasswordHash(
    candidatePassword,
    user.salt,
    isCurrentHash ? PAYLOAD_PASSWORD_HASH_ITERATIONS : PAYLOAD_LEGACY_PASSWORD_HASH_ITERATIONS,
    keyLength,
  )

  return timingSafeEqual(derivedHash, storedHash)
}

export const extractOpenApiDocsRequestHeader = (
  req: PayloadRequest,
  headerName: string,
): string | null => {
  const target = headerName.toLowerCase()

  if (req.headers instanceof Headers) {
    return req.headers.get(target)
  }

  if (req.headers && typeof req.headers === 'object') {
    const record = req.headers as Record<string, string | string[] | undefined>

    for (const [key, value] of Object.entries(record)) {
      if (key.toLowerCase() === target) {
        return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
      }
    }
  }

  return null
}

export const parseOpenApiDocsBasicCredentials = (
  req: PayloadRequest,
): OpenApiDocsBasicCredentials | null => {
  const authorizationHeader = extractOpenApiDocsRequestHeader(req, 'authorization')

  if (!authorizationHeader?.startsWith(HTTP_BASIC_AUTH_SCHEME)) {
    return null
  }

  const base64Credentials = authorizationHeader.slice(HTTP_BASIC_AUTH_SCHEME.length).trim()
  const decodedCredentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
  const separatorIndex = decodedCredentials.indexOf(':')

  if (separatorIndex <= 0) {
    return null
  }

  return {
    email: decodedCredentials.slice(0, separatorIndex).toLowerCase().trim(),
    password: decodedCredentials.slice(separatorIndex + 1),
  }
}

export const authenticateOpenApiDocsSuperAdmin = async (
  payload: Payload | undefined,
  credentials: OpenApiDocsBasicCredentials,
): Promise<boolean> => {
  if (!payload) {
    return false
  }

  const candidateUser = await payload.db.findOne<PayloadPasswordUser>({
    collection: USERS_COLLECTION_SLUG,
    where: { email: { equals: credentials.email } },
  })

  if (!candidateUser) {
    return false
  }

  const isPasswordValid = await verifyPayloadUserPasswordHash(candidateUser, credentials.password)

  return isPasswordValid && candidateUser.role === SUPERADMIN_USER_ROLE
}
