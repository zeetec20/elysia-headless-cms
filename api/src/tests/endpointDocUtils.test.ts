import { describe, expect, it } from 'bun:test'
import { createStandardEndpointDocumentation } from '@/utils/endpointDocUtils'

describe('Endpoint Doc Utils', () => {
  it('creates public endpoint documentation without security', () => {
    const doc = createStandardEndpointDocumentation({
      summary: 'Public Endpoint',
      description: 'Public description',
      tags: ['public'],
      authenticated: false,
      dataSchema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
      },
    })

    expect(doc.summary).toBe('Public Endpoint')
    expect(doc.description).toBe('Public description')
    expect(doc.tags).toEqual(['public'])
    expect(doc.security).toEqual([])
    expect(doc.responses?.[200]).toBeDefined()
    expect(doc.responses?.[400]).toBeDefined()
    expect(doc.responses?.[500]).toBeDefined()
    expect(doc.responses?.[401]).toBeUndefined()
  })

  it('creates authenticated endpoint documentation with security and 401 response', () => {
    const doc = createStandardEndpointDocumentation({
      summary: 'Secure Endpoint',
      authenticated: true,
      dataSchema: {
        type: 'object',
        properties: {
          secret: { type: 'string' },
        },
      },
    })

    expect(doc.summary).toBe('Secure Endpoint')
    expect(doc.security).toEqual([{ ApiKey: [] }])
    expect(doc.responses?.[401]).toBeDefined()
    expect(doc.responses?.[401]?.description).toBe('Unauthorized - Valid Bearer token required')
    expect(doc.responses?.[200]).toBeDefined()
  })
})
