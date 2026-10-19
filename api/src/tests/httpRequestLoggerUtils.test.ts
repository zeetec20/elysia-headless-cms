import { describe, expect, it, mock } from 'bun:test'
import type { PayloadLogger } from 'payload'
import {
  formatHttpRequestDuration,
  formatHttpRequestLogMessage,
  type HttpRequestLogEntry,
  resolveHttpRequestLogLevel,
  withHttpRequestLogging,
  writeHttpRequestLog,
} from '@/utils/httpRequestLoggerUtils'

const createMockPayloadLogger = () => {
  return {
    info: mock((_data: unknown, _msg?: string) => {}),
    warn: mock((_data: unknown, _msg?: string) => {}),
    error: mock((_data: unknown, _msg?: string) => {}),
  } as unknown as PayloadLogger
}

describe('HTTP Request Logger Utils', () => {
  describe('formatHttpRequestDuration', () => {
    it('formats millisecond floats to exact two decimal digits', () => {
      expect(formatHttpRequestDuration(0)).toBe('0.00ms')
      expect(formatHttpRequestDuration(12.3456)).toBe('12.35ms')
      expect(formatHttpRequestDuration(100)).toBe('100.00ms')
      expect(formatHttpRequestDuration(999.999)).toBe('1000.00ms')
    })
  })

  describe('resolveHttpRequestLogLevel', () => {
    it('returns info for 2xx and 3xx status codes', () => {
      expect(resolveHttpRequestLogLevel(200)).toBe('info')
      expect(resolveHttpRequestLogLevel(201)).toBe('info')
      expect(resolveHttpRequestLogLevel(204)).toBe('info')
      expect(resolveHttpRequestLogLevel(301)).toBe('info')
      expect(resolveHttpRequestLogLevel(304)).toBe('info')
    })

    it('returns warn for 4xx client error status codes', () => {
      expect(resolveHttpRequestLogLevel(400)).toBe('warn')
      expect(resolveHttpRequestLogLevel(401)).toBe('warn')
      expect(resolveHttpRequestLogLevel(403)).toBe('warn')
      expect(resolveHttpRequestLogLevel(404)).toBe('warn')
      expect(resolveHttpRequestLogLevel(422)).toBe('warn')
    })

    it('returns error for 5xx server error status codes and hasError true', () => {
      expect(resolveHttpRequestLogLevel(500)).toBe('error')
      expect(resolveHttpRequestLogLevel(502)).toBe('error')
      expect(resolveHttpRequestLogLevel(503)).toBe('error')
      expect(resolveHttpRequestLogLevel(200, true)).toBe('error')
      expect(resolveHttpRequestLogLevel(400, true)).toBe('error')
    })
  })

  describe('formatHttpRequestLogMessage', () => {
    it('formats standard request message matching METHOD PATH STATUS - DURATION', () => {
      const entry: HttpRequestLogEntry = {
        timestamp: '14:30:00',
        method: 'GET',
        path: '/api/posts?limit=10',
        status: 200,
        durationMs: 15.2,
        level: 'info',
      }
      expect(formatHttpRequestLogMessage(entry)).toBe('GET /api/posts?limit=10 200 - 15.20ms')
    })

    it('formats message with error suffix when errorMessage is present', () => {
      const entry: HttpRequestLogEntry = {
        timestamp: '14:30:00',
        method: 'POST',
        path: '/api/posts',
        status: 500,
        durationMs: 42.1,
        level: 'error',
        errorMessage: 'Database connection failed',
      }
      expect(formatHttpRequestLogMessage(entry)).toBe(
        'POST /api/posts 500 - 42.10ms (error: Database connection failed)',
      )
    })
  })

  describe('writeHttpRequestLog', () => {
    it('routes to custom sink when provided', () => {
      const logs: HttpRequestLogEntry[] = []
      const entry: HttpRequestLogEntry = {
        timestamp: '12:00:00',
        method: 'GET',
        path: '/test',
        status: 200,
        durationMs: 1.0,
        level: 'info',
      }
      writeHttpRequestLog(entry, (e) => logs.push(e))
      expect(logs).toEqual([entry])
    })

    it('dispatches to logger when provided', () => {
      const mockLogger = createMockPayloadLogger()
      const entry: HttpRequestLogEntry = {
        timestamp: '12:00:00',
        method: 'POST',
        path: '/api/users',
        status: 201,
        durationMs: 25.5,
        level: 'info',
      }
      writeHttpRequestLog(entry, undefined, mockLogger)
      expect(mockLogger.info).toHaveBeenCalledTimes(1)
      expect(mockLogger.info).toHaveBeenCalledWith('POST /api/users 201 - 25.50ms')
    })
  })

  describe('withHttpRequestLogging', () => {
    it('logs successful GET requests with 200 status and info level via logger and sink', async () => {
      const mockLogger = createMockPayloadLogger()
      const { promise, resolve } = Promise.withResolvers<HttpRequestLogEntry>()
      const handler = withHttpRequestLogging(
        () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
        {
          logger: mockLogger,
          sink: (entry) => resolve(entry),
        },
      )

      const response = await handler(
        new Request('http://localhost/test?page=1', {
          headers: {
            'user-agent': 'BunTestAgent/1.0',
            'x-forwarded-for': '192.168.1.1, 10.0.0.1',
          },
        }),
      )

      const log = await promise
      expect(response.status).toBe(200)
      expect(log.method).toBe('GET')
      expect(log.path).toBe('/test?page=1')
      expect(log.status).toBe(200)
      expect(log.level).toBe('info')
      expect(log.durationMs).toBeGreaterThanOrEqual(0)

      expect(mockLogger.info).toHaveBeenCalledTimes(1)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^GET \/test\?page=1 200 - \d+\.\d{2}ms$/),
      )
    })

    it('logs routes setting 404 with warn level via async logger function', async () => {
      const mockLogger = createMockPayloadLogger()
      const { promise, resolve } = Promise.withResolvers<HttpRequestLogEntry>()
      const handler = withHttpRequestLogging(
        () => new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
        {
          logger: async () => mockLogger,
          sink: (entry) => resolve(entry),
        },
      )

      const response = await handler(new Request('http://localhost/not-found'))
      const log = await promise
      expect(response.status).toBe(404)
      expect(log.status).toBe(404)
      expect(log.level).toBe('warn')

      expect(mockLogger.warn).toHaveBeenCalledTimes(1)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/^GET \/not-found 404 - \d+\.\d{2}ms$/),
      )
    })

    it('logs route throwing error with 500 status, error level, and errorMessage', async () => {
      const mockLogger = createMockPayloadLogger()
      const { promise, resolve } = Promise.withResolvers<HttpRequestLogEntry>()
      const handler = withHttpRequestLogging(
        () => {
          throw new Error('Database connection lost')
        },
        {
          logger: mockLogger,
          sink: (entry) => resolve(entry),
        },
      )

      const response = await handler(new Request('http://localhost/boom'))
      const log = await promise
      expect(response.status).toBe(500)
      expect(log.status).toBe(500)
      expect(log.level).toBe('error')
      expect(log.errorMessage).toBe('Database connection lost')

      expect(mockLogger.error).toHaveBeenCalledTimes(1)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringMatching(
          /^GET \/boom 500 - \d+\.\d{2}ms \(error: Database connection lost\)$/,
        ),
      )
    })

    it('respects disabled option and skips logging', async () => {
      const mockLogger = createMockPayloadLogger()
      const logs: HttpRequestLogEntry[] = []
      const handler = withHttpRequestLogging(() => new Response('quiet', { status: 200 }), {
        disabled: true,
        logger: mockLogger,
        sink: (entry) => logs.push(entry),
      })

      const response = await handler(new Request('http://localhost/silent'))
      expect(response.status).toBe(200)
      expect(logs).toHaveLength(0)
      expect(mockLogger.info).toHaveBeenCalledTimes(0)
      expect(mockLogger.warn).toHaveBeenCalledTimes(0)
      expect(mockLogger.error).toHaveBeenCalledTimes(0)
    })
  })
})
