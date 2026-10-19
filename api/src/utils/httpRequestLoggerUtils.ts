export type HttpRequestLogLevel = 'info' | 'warn' | 'error'

export interface HttpRequestLogEntry {
  timestamp: string
  method: string
  path: string
  status: number
  durationMs: number
  level: HttpRequestLogLevel
  userAgent?: string | null
  ip?: string | null
  errorMessage?: string
}

export type HttpRequestLogSink = (entry: HttpRequestLogEntry) => void

export interface HttpRequestLoggingOptions {
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

const formatHttpRequestTime = (timestamp: string): string => {
  const parsedDate = new Date(timestamp)
  if (Number.isNaN(parsedDate.getTime())) {
    return timestamp
  }
  const hours = String(parsedDate.getHours()).padStart(2, '0')
  const minutes = String(parsedDate.getMinutes()).padStart(2, '0')
  const seconds = String(parsedDate.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

export const formatHttpRequestLogMessage = (entry: HttpRequestLogEntry): string => {
  const time = formatHttpRequestTime(entry.timestamp)
  const level = entry.level.toUpperCase()
  const duration = formatHttpRequestDuration(entry.durationMs)
  const errorSuffix = entry.errorMessage ? ` (error: ${entry.errorMessage})` : ''
  return `[${time}] [${level}] [HTTP] ${entry.method} ${entry.path} ${entry.status} - ${duration}${errorSuffix}`
}

export const writeHttpRequestLog = (
  entry: HttpRequestLogEntry,
  sink?: HttpRequestLogSink,
): void => {
  if (sink) {
    sink(entry)
    return
  }
  const message = formatHttpRequestLogMessage(entry)
  console[entry.level](message)
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
    const userAgent = request.headers.get('user-agent')
    const forwardedFor = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : (realIp ?? null)

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
      userAgent,
      ip,
      ...(errorMessage ? { errorMessage } : {}),
    }

    writeHttpRequestLog(entry, options.sink)

    return response
  }
}
