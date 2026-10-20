import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { Payload, PayloadLogger, PayloadRequest } from 'payload'
import {
  extractPayloadLogger,
  getDefaultPayloadLogger,
  logEndpointError,
  logEndpointInfo,
  logEndpointWarn,
  logPayloadError,
  logPayloadInfo,
  logPayloadWarn,
  setDefaultPayloadLogger,
} from '@/utils/payloadLoggerUtils'

const createMockPayloadLogger = (): PayloadLogger => {
  return {
    info: mock((_dataOrMsg: unknown, _msg?: string) => {}),
    warn: mock((_dataOrMsg: unknown, _msg?: string) => {}),
    error: mock((_dataOrMsg: unknown, _msg?: string) => {}),
  } as unknown as PayloadLogger
}

describe('Payload Logger Utils', () => {
  let mockLogger: PayloadLogger

  beforeEach(() => {
    mockLogger = createMockPayloadLogger()
    setDefaultPayloadLogger(undefined)
  })

  afterEach(() => {
    setDefaultPayloadLogger(undefined)
  })

  describe('extractPayloadLogger & default logger', () => {
    it('returns direct PayloadLogger when passed directly', () => {
      expect(extractPayloadLogger(mockLogger)).toBe(mockLogger)
    })

    it('extracts logger from Payload instance', () => {
      const payload = { logger: mockLogger } as unknown as Payload
      expect(extractPayloadLogger(payload)).toBe(mockLogger)
    })

    it('extracts logger from PayloadRequest instance', () => {
      const req = { payload: { logger: mockLogger } } as unknown as PayloadRequest
      expect(extractPayloadLogger(req)).toBe(mockLogger)
    })

    it('returns defaultPayloadLogger when target is null or undefined', () => {
      expect(extractPayloadLogger(undefined)).toBeUndefined()
      setDefaultPayloadLogger(mockLogger)
      expect(getDefaultPayloadLogger()).toBe(mockLogger)
      expect(extractPayloadLogger(undefined)).toBe(mockLogger)
      expect(extractPayloadLogger(null)).toBe(mockLogger)
    })
  })

  describe('logPayloadInfo', () => {
    it('logs message directly without extra', () => {
      logPayloadInfo(mockLogger, 'server started')
      expect(mockLogger.info).toHaveBeenCalledTimes(1)
      expect(mockLogger.info).toHaveBeenCalledWith('server started')
    })

    it('logs message with extra metadata payload', () => {
      logPayloadInfo(mockLogger, 'user logged in', { userId: 42 })
      expect(mockLogger.info).toHaveBeenCalledTimes(1)
      expect(mockLogger.info).toHaveBeenCalledWith({ extra: { userId: 42 } }, 'user logged in')
    })

    it('uses defaultPayloadLogger when target is omitted', () => {
      setDefaultPayloadLogger(mockLogger)
      logPayloadInfo(undefined, 'fallback info')
      expect(mockLogger.info).toHaveBeenCalledWith('fallback info')
    })
  })

  describe('logPayloadWarn', () => {
    it('logs warning without extra', () => {
      logPayloadWarn(mockLogger, 'rate limit approaching')
      expect(mockLogger.warn).toHaveBeenCalledTimes(1)
      expect(mockLogger.warn).toHaveBeenCalledWith('rate limit approaching')
    })

    it('logs warning with extra payload', () => {
      logPayloadWarn(mockLogger, 'rate limit approaching', { count: 95 })
      expect(mockLogger.warn).toHaveBeenCalledTimes(1)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { extra: { count: 95 } },
        'rate limit approaching',
      )
    })
  })

  describe('logPayloadError', () => {
    it('logs error message with error object', () => {
      const err = new Error('db failure')
      logPayloadError(mockLogger, 'migration failed', err)
      expect(mockLogger.error).toHaveBeenCalledTimes(1)
      expect(mockLogger.error).toHaveBeenCalledWith({ err }, 'migration failed')
    })

    it('logs error message without error object', () => {
      logPayloadError(mockLogger, 'unexpected condition')
      expect(mockLogger.error).toHaveBeenCalledTimes(1)
      expect(mockLogger.error).toHaveBeenCalledWith('unexpected condition')
    })
  })

  describe('backwards compatibility aliases', () => {
    it('aliases logEndpointInfo to logPayloadInfo', () => {
      expect(logEndpointInfo).toBe(logPayloadInfo)
    })

    it('aliases logEndpointWarn to logPayloadWarn', () => {
      expect(logEndpointWarn).toBe(logPayloadWarn)
    })

    it('aliases logEndpointError to logPayloadError', () => {
      expect(logEndpointError).toBe(logPayloadError)
    })
  })
})
