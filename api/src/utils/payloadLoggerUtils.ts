import type { Payload, PayloadRequest } from 'payload'

type LogTarget = PayloadRequest | Payload | null | undefined

const extractPayloadLogger = (target?: LogTarget) => {
  if (!target) return undefined
  if ('logger' in target && target.logger) return target.logger
  if ('payload' in target && target.payload?.logger) return target.payload.logger
  return undefined
}

export const logEndpointInfo = (target: LogTarget, message: string, extra?: unknown): void => {
  const logger = extractPayloadLogger(target)
  if (!logger?.info) return

  if (extra !== undefined) {
    logger.info({ extra }, message)
    return
  }

  logger.info(message)
}

export const logEndpointWarn = (target: LogTarget, message: string, extra?: unknown): void => {
  const logger = extractPayloadLogger(target)
  if (!logger?.warn) return

  if (extra !== undefined) {
    logger.warn({ extra }, message)
    return
  }

  logger.warn(message)
}

export const logEndpointError = (target: LogTarget, message: string, error?: unknown): void => {
  const logger = extractPayloadLogger(target)
  if (!logger?.error) return

  if (error !== undefined) {
    logger.error({ err: error }, message)
    return
  }

  logger.error(message)
}
