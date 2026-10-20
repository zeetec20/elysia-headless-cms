import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPayload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const generatePayloadOpenApiSpecification = async () => {
  const payload = await getPayload({ config })
  payload.logger.info('Generating OpenAPI specification for Payload CMS...')
  const endpoint = payload.config.endpoints?.find(
    (e) => e.path === '/openapi.json' && e.method === 'get',
  )

  if (!endpoint) {
    throw new Error('OpenAPI endpoint (/openapi.json) not registered in Payload configuration')
  }

  const serverUrl = process.env.SERVER_URL || 'http://localhost:3000'
  const parsedUrl = new URL(serverUrl)

  // NOTE: `internalDocsRequest` bypasses the docs gate in-process; HTTP callers cannot set it.
  const mockRequest = {
    payload,
    protocol: parsedUrl.protocol,
    headers: new Headers({
      host: parsedUrl.host,
    }),
    internalDocsRequest: true,
  } as unknown as PayloadRequest

  const response = await endpoint.handler(mockRequest)
  const spec = await response.json()

  const outputPath = path.resolve(dirname, '../openapi.json')
  await fs.writeFile(outputPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf-8')

  payload.logger.info(`✓ OpenAPI specification successfully written to ${outputPath}`)
  process.exit(0)
}

generatePayloadOpenApiSpecification().catch((error) => {
  process.stderr.write(`Failed to generate OpenAPI specification: ${String(error)}\n`)
  process.exit(1)
})
