import { describe, expect, it } from 'bun:test'
import { createApiErrorResponse, createApiSuccessResponse } from '@/utils/apiResponseUtils'

describe('API Response Utils', () => {
  describe('createApiSuccessResponse', () => {
    it('creates standard 200 success response with data envelope', async () => {
      const response = createApiSuccessResponse({ foo: 'bar' })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')

      const body = await response.json()
      expect(body).toEqual({
        success: true,
        data: { foo: 'bar' },
      })
    })

    it('supports custom status codes like 201', async () => {
      const response = createApiSuccessResponse({ id: '123' }, 201)
      expect(response.status).toBe(201)

      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data).toEqual({ id: '123' })
    })
  })

  describe('createApiErrorResponse', () => {
    it('creates standard error response with default 500 status', async () => {
      const response = createApiErrorResponse('Server error')
      expect(response.status).toBe(500)

      const body = await response.json()
      expect(body).toEqual({
        success: false,
        error: 'Server error',
      })
    })

    it('supports custom status codes and extra headers', async () => {
      const response = createApiErrorResponse('Unauthorized access', 401, {
        'www-authenticate': 'Bearer realm="Payload API"',
      })
      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toBe('Bearer realm="Payload API"')

      const body = await response.json()
      expect(body).toEqual({
        success: false,
        error: 'Unauthorized access',
      })
    })
  })
})
