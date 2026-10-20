/** NOTE: Payload 3.x password hashing format; re-check these constants when upgrading Payload. */
export const PAYLOAD_PASSWORD_HASH_PREFIX = 'pbkdf2-sha256-v1:'
export const PAYLOAD_PASSWORD_HASH_ITERATIONS = 600_000
export const PAYLOAD_PASSWORD_HASH_KEY_LENGTH = 32
export const PAYLOAD_LEGACY_PASSWORD_HASH_ITERATIONS = 25_000
export const PAYLOAD_LEGACY_PASSWORD_HASH_KEY_LENGTH = 512
