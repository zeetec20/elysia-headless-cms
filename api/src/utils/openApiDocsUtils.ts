import { OPEN_API_DOCS_PUBLIC_PATH } from '../constants'

export const isOpenApiDocsDevelopmentEnvironment = (
  env: Record<string, string | undefined> = process.env,
): boolean => env.APP_ENV === 'development'

export const isOpenApiDocsUatEnvironment = (
  env: Record<string, string | undefined> = process.env,
): boolean => env.APP_ENV === 'uat'

/** NOTE: Local and UAT are the only environments where the docs URL is printed on boot. */
export const isOpenApiDocsPrintableEnvironment = (
  env: Record<string, string | undefined> = process.env,
): boolean => isOpenApiDocsDevelopmentEnvironment(env) || isOpenApiDocsUatEnvironment(env)

export const resolveOpenApiDocsUrl = (
  env: Record<string, string | undefined> = process.env,
  port = 3000,
): string => {
  const baseUrl = (env.SERVER_URL || `http://localhost:${port}`).replace(/\/$/, '')
  return `${baseUrl}${OPEN_API_DOCS_PUBLIC_PATH}`
}
