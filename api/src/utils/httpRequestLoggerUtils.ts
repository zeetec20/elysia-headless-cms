import type { PayloadLogger } from 'payload'

export type HttpRequestLogLevel = 'info' | 'warn' | 'error'

export interface HttpRequestLogEntry {
  timestamp: string
  method: string
  path: string
  status: number
  durationMs: number
  level: HttpRequestLogLevel
  errorMessage?: string
}

export type HttpRequestLogSink = (entry: HttpRequestLogEntry) => void

export interface HttpRequestLoggingOptions {
  logger?: PayloadLogger | (() => PayloadLogger | Promise<PayloadLogger>)
  sink?: HttpRequestLogSink
  disabled?: boolean
}

export const formatHttpRequestDuration = (durationMs: number): string => {
  return `${durationMs.toFixed(2)}ms`
}

export const resolveHttpRequestLogLevel = (
  status: number,
  hasError?: boolean,
): HttpRequestLogLevel => {
  if (hasError || status >= 500) {
    return 'error'
  }
  if (status >= 400) {
    return 'warn'
  }
  return 'info'
}

export const formatHttpRequestLogMessage = (
  entry: Pick<HttpRequestLogEntry, 'method' | 'path' | 'status' | 'durationMs' | 'errorMessage'>,
): string => {
  const duration = formatHttpRequestDuration(entry.durationMs)
  const errorSuffix = entry.errorMessage ? ` (error: ${entry.errorMessage})` : ''
  return `${entry.method} ${entry.path} ${entry.status} - ${duration}${errorSuffix}`
}

export const writeHttpRequestLog = (
  entry: HttpRequestLogEntry,
  sink?: HttpRequestLogSink,
  logger?: PayloadLogger,
): void => {
  if (sink) {
    sink(entry)
  }
  if (logger) {
    const message = formatHttpRequestLogMessage(entry)
    logger[entry.level](message)
  }
}

export type HttpRequestHandler = (request: Request) => Response | Promise<Response>

export const withHttpRequestLogging = (
  handler: HttpRequestHandler,
  options: HttpRequestLoggingOptions = {},
): HttpRequestHandler => {
  if (options.disabled) {
    return handler
  }

  return async (request: Request): Promise<Response> => {
    const startTime = performance.now()
    const url = new URL(request.url)
    const path = `${url.pathname}${url.search}`

    let response: Response
    let errorMessage: string | undefined

    try {
      response = await handler(request)
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error)
      response = new Response('Internal Server Error', { status: 500 })
    }

    const durationMs = performance.now() - startTime
    const status = response.status
    const hasError = status >= 500 || (errorMessage !== undefined && status !== 404)
    const level = resolveHttpRequestLogLevel(status, hasError)

    const entry: HttpRequestLogEntry = {
      timestamp: new Date().toISOString(),
      method: request.method,
      path,
      status,
      durationMs,
      level,
      ...(errorMessage ? { errorMessage } : {}),
    }

    const resolvedLogger =
      typeof options.logger === 'function' ? await options.logger() : options.logger

    writeHttpRequestLog(entry, options.sink, resolvedLogger)

    return response
  }
}
