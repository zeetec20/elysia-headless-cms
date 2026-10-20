export interface InitialAdminCredentials {
  email: string
  password: string
}

export const resolvePayloadAuthSecret = (
  env: Record<string, string | undefined> = process.env,
): string => {
  const configuredSecret = env.PAYLOAD_SECRET?.trim()

  if (configuredSecret) {
    if (configuredSecret.length < 32) {
      throw new Error('PAYLOAD_SECRET must be at least 32 characters long')
    }

    return configuredSecret
  }

  throw new Error('PAYLOAD_SECRET must be set')
}

export const resolveInitialAdminCredentials = (
  env: Record<string, string | undefined> = process.env,
): InitialAdminCredentials | null => {
  const email = env.INITIAL_ADMIN_EMAIL?.trim()
  const password = env.INITIAL_ADMIN_PASSWORD

  if (email && password) {
    return { email, password }
  }

  return null
}
