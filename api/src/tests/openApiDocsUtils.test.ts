import { describe, expect, it } from 'bun:test'
import {
  isOpenApiDocsDevelopmentEnvironment,
  isOpenApiDocsPrintableEnvironment,
  isOpenApiDocsUatEnvironment,
  resolveOpenApiDocsUrl,
} from '@/utils/openApiDocsUtils'

describe('OpenAPI Docs Utils', () => {
  it('detects the local development environment', () => {
    expect(isOpenApiDocsDevelopmentEnvironment({ APP_ENV: 'development' })).toBe(true)
    expect(isOpenApiDocsDevelopmentEnvironment({ APP_ENV: 'uat' })).toBe(false)
  })

  it('detects the uat environment', () => {
    expect(isOpenApiDocsUatEnvironment({ APP_ENV: 'uat' })).toBe(true)
    expect(isOpenApiDocsUatEnvironment({ APP_ENV: 'development' })).toBe(false)
  })

  it('prints the docs url only for local and uat', () => {
    expect(isOpenApiDocsPrintableEnvironment({ APP_ENV: 'development' })).toBe(true)
    expect(isOpenApiDocsPrintableEnvironment({ APP_ENV: 'uat' })).toBe(true)
    expect(isOpenApiDocsPrintableEnvironment({ APP_ENV: 'production' })).toBe(false)
    expect(isOpenApiDocsPrintableEnvironment({})).toBe(false)
  })

  it('builds the docs url from the server url', () => {
    expect(resolveOpenApiDocsUrl({ SERVER_URL: 'https://api.example.com/' }, 3000)).toBe(
      'https://api.example.com/api/docs',
    )
  })

  it('falls back to the local server url', () => {
    expect(resolveOpenApiDocsUrl({}, 3000)).toBe('http://localhost:3000/api/docs')
  })
})
