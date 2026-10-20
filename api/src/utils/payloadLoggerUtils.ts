import type { Payload, PayloadLogger, PayloadRequest } from 'payload'

export type PayloadLogTarget = PayloadRequest | Payload | PayloadLogger | null | undefined

let defaultPayloadLogger: PayloadLogger | undefined

export const setDefaultPayloadLogger = (logger?: PayloadLogger): void => {
  defaultPayloadLogger = logger
}

export const getDefaultPayloadLogger = (): PayloadLogger | undefined => defaultPayloadLogger

export const extractPayloadLogger = (target?: PayloadLogTarget): PayloadLogger | undefined => {
  if (!target) return defaultPayloadLogger
  if ('info' in target && typeof target.info === 'function') return target as PayloadLogger
  if ('logger' in target && target.logger) return target.logger
  if ('payload' in target && target.payload?.logger) return target.payload.logger
  return defaultPayloadLogger
}

export const logInfo = (target: PayloadLogTarget, message: string, extra?: unknown): void => {
  const logger = extractPayloadLogger(target)
  if (!logger?.info) return

  if (extra !== undefined) {
    logger.info({ extra }, message)
    return
  }

  logger.info(message)
}

export const logWarn = (target: PayloadLogTarget, message: string, extra?: unknown): void => {
  const logger = extractPayloadLogger(target)
  if (!logger?.warn) return

  if (extra !== undefined) {
    logger.warn({ extra }, message)
    return
  }

  logger.warn(message)
}

export const logError = (target: PayloadLogTarget, message: string, error?: unknown): void => {
  const logger = extractPayloadLogger(target)
  if (logger?.error) {
    if (error !== undefined) {
      logger.error({ err: error }, message)
      return
    }

    logger.error(message)
    return
  }

  if (error !== undefined) {
    console.error(message, error)
    return
  }

  console.error(message)
}

export const logPayloadInfo = logInfo
export const logPayloadWarn = logWarn
export const logPayloadError = logError
export const logEndpointInfo = logInfo
export const logEndpointWarn = logWarn
export const logEndpointError = logError
