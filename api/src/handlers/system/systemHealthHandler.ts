import type { PayloadRequest } from 'payload'
import type { CustomEndpointDocumentation } from 'payload-oapi'
import { getSystemHealthStatusService } from '../../services/system'
import { createApiSuccessResponse } from '../../utils/apiResponseUtils'
import { createStandardEndpointDocumentation } from '../../utils/endpointDocUtils'

export const createHealthCheckOpenApiDocumentation = (): CustomEndpointDocumentation => {
  return createStandardEndpointDocumentation({
    summary: 'Check system health',
    description: 'Verifies service availability and system uptime.',
    tags: ['system'],
    authenticated: false,
    dataSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        uptime: { type: 'number', example: 12.34 },
        timestamp: { type: 'string', format: 'date-time' },
      },
      required: ['status', 'uptime', 'timestamp'],
    },
  })
}

export const healthCheckOpenApiDocumentation: CustomEndpointDocumentation =
  createHealthCheckOpenApiDocumentation()

// NOTE: Deliberately no database probe: health checks run frequently and a round-trip per probe
// is too heavy; process liveness is all the dashboard/infrastructure needs to see.
// The PayloadRequest argument stays for endpoint-signature parity with the other handlers.
export const handleGetHealthCheckEndpoint = async (_req: PayloadRequest): Promise<Response> => {
  const data = getSystemHealthStatusService()
  return createApiSuccessResponse(data, 200)
}

export const systemHealthPayloadEndpoint = {
  path: '/health',
  method: 'get' as const,
  custom: {
    openapi: healthCheckOpenApiDocumentation,
  },
  handler: handleGetHealthCheckEndpoint,
}
