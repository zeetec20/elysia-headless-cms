import { describe, expect, it, mock } from 'bun:test'
import { Elysia } from 'elysia'
import {
  createHttpRequestLoggingPlugin,
  formatHttpRequestDuration,
  formatHttpRequestLogMessage,
  type HttpRequestLogEntry,
  resolveHttpRequestLogLevel,
  writeHttpRequestLog,
} from '@/utils/httpRequestLoggerUtils'

describe('HTTP Request Logger Utils', () => {
  describe('formatHttpRequestDuration', () => {
    it('formats millisecond floats to exact two decimal digits', () => {
      expect(formatHttpRequestDuration(3.456)).toBe('3.46ms')
      expect(formatHttpRequestDuration(0)).toBe('0.00ms')
      expect(formatHttpRequestDuration(15.2)).toBe('15.20ms')
      expect(formatHttpRequestDuration(120.999)).toBe('121.00ms')
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
      expect(resolveHttpRequestLogLevel(404, true)).toBe('error')
    })
  })

  describe('formatHttpRequestLogMessage', () => {
    it('validates output pattern matching [HH:MM:SS] [INFO] [HTTP] GET /api/posts?limit=10 200 - 15.20ms', () => {
      const entry: HttpRequestLogEntry = {
        timestamp: '14:30:00',
        method: 'GET',
        path: '/api/posts?limit=10',
        status: 200,
        durationMs: 15.2,
        level: 'info',
      }
      expect(formatHttpRequestLogMessage(entry)).toBe(
        '[14:30:00] [INFO] [HTTP] GET /api/posts?limit=10 200 - 15.20ms',
      )
    })

    it('validates output with error suffix when errorMessage is present', () => {
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
        '[14:30:00] [ERROR] [HTTP] POST /api/posts 500 - 42.10ms (error: Database connection failed)',
      )
    })

    it('parses ISO date timestamps into HH:MM:SS format', () => {
      const isoDate = new Date('2025-01-01T12:34:56Z').toISOString()
      const entry: HttpRequestLogEntry = {
        timestamp: isoDate,
        method: 'GET',
        path: '/api/health',
        status: 200,
        durationMs: 5.12,
        level: 'info',
      }
      const message = formatHttpRequestLogMessage(entry)
      expect(message).toMatch(
        /^\[\d{2}:\d{2}:\d{2}\] \[INFO\] \[HTTP\] GET \/api\/health 200 - 5.12ms$/,
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

    it('falls back to console methods when no sink is provided', () => {
      const originalInfo = console.info
      const originalWarn = console.warn
      const originalError = console.error

      const infoMock = mock(() => {})
      const warnMock = mock(() => {})
      const errorMock = mock(() => {})

      console.info = infoMock
      console.warn = warnMock
      console.error = errorMock

      try {
        writeHttpRequestLog({
          timestamp: '10:00:00',
          method: 'GET',
          path: '/info',
          status: 200,
          durationMs: 1,
          level: 'info',
        })
        expect(infoMock).toHaveBeenCalledTimes(1)

        writeHttpRequestLog({
          timestamp: '10:00:00',
          method: 'GET',
          path: '/warn',
          status: 404,
          durationMs: 1,
          level: 'warn',
        })
        expect(warnMock).toHaveBeenCalledTimes(1)

        writeHttpRequestLog({
          timestamp: '10:00:00',
          method: 'GET',
          path: '/err',
          status: 500,
          durationMs: 1,
          level: 'error',
        })
        expect(errorMock).toHaveBeenCalledTimes(1)
      } finally {
        console.info = originalInfo
        console.warn = originalWarn
        console.error = originalError
      }
    })
  })

  describe('createHttpRequestLoggingPlugin with Elysia lifecycle', () => {
    it('logs successful GET requests with 200 status and info level', async () => {
      const { promise, resolve } = Promise.withResolvers<HttpRequestLogEntry>()
      const app = new Elysia()
        .use(createHttpRequestLoggingPlugin({ sink: (entry) => resolve(entry) }))
        .get('/test', () => ({ ok: true }))

      const response = await app.handle(
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
      expect(log.userAgent).toBe('BunTestAgent/1.0')
      expect(log.ip).toBe('192.168.1.1')
      expect(log.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('logs routes setting 404 with warn level', async () => {
      const { promise, resolve } = Promise.withResolvers<HttpRequestLogEntry>()
      const app = new Elysia()
        .use(createHttpRequestLoggingPlugin({ sink: (entry) => resolve(entry) }))
        .get('/not-found', ({ set }) => {
          set.status = 404
          return { error: 'Not found' }
        })

      const response = await app.handle(new Request('http://localhost/not-found'))
      const log = await promise
      expect(response.status).toBe(404)
      expect(log.status).toBe(404)
      expect(log.level).toBe('warn')
    })

    it('logs route throwing error with 500 status, error level, and errorMessage', async () => {
      const { promise, resolve } = Promise.withResolvers<HttpRequestLogEntry>()
      const app = new Elysia()
        .use(createHttpRequestLoggingPlugin({ sink: (entry) => resolve(entry) }))
        .get('/boom', () => {
          throw new Error('Database connection lost')
        })

      const response = await app.handle(new Request('http://localhost/boom'))
      const log = await promise
      expect(response.status).toBe(500)
      expect(log.status).toBe(500)
      expect(log.level).toBe('error')
      expect(log.errorMessage).toBe('Database connection lost')
    })

    it('respects disabled option and skips logging', async () => {
      const { promise, resolve } = Promise.withResolvers<void>()
      const logs: HttpRequestLogEntry[] = []
      const app = new Elysia()
        .use(
          createHttpRequestLoggingPlugin({
            disabled: true,
            sink: (entry) => logs.push(entry),
          }),
        )
        .onAfterResponse(() => {
          resolve()
        })
        .get('/silent', () => 'quiet')

      const response = await app.handle(new Request('http://localhost/silent'))
      await promise
      expect(response.status).toBe(200)
      expect(logs).toHaveLength(0)
    })
  })
})
