import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { openapi, scalar } from 'payload-oapi'
import { Posts } from './collections/Posts'
import { Users } from './collections/Users'
import { secureOpenApiDocsPlugin, systemHealthPayloadEndpoint } from './handlers/system'
import { endpointAuthMiddlewarePlugin } from './utils/endpointAuthUtils'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const rawDatabaseUri = process.env.DATABASE_URI
const databaseUri =
  rawDatabaseUri &&
  (rawDatabaseUri.startsWith('postgres://') || rawDatabaseUri.startsWith('postgresql://'))
    ? rawDatabaseUri
    : 'postgres://postgres@127.0.0.1:5432/payload_elysia'
const serverUrl = process.env.SERVER_URL || 'http://localhost:3000'

export default buildConfig({
  // NOTE: Headless mode: no Payload admin UI exists here (no Next.js app dir); the Refine
  // dashboard consumes the REST API below as an authenticated REST client.
  admin: {
    disable: true,
    user: Users.slug,
    // NOTE: Dev-mode admin auto-login must never inject a session into a custom dashboard.
    autoLogin: false,
  },
  serverURL: serverUrl,
  // NOTE: Dev-mode direct access origin for the Refine dashboard when not reverse-proxied.
  cors: [process.env.DASHBOARD_URL || 'http://localhost:5173'],
  // NOTE: Cookie-based auth is CSRF-checked (extractJWT): the dashboard origin must be
  // allowlisted or browser cookie requests are rejected.
  csrf: [process.env.DASHBOARD_URL || 'http://localhost:5173'],
  graphQL: {
    disable: true,
  },
  plugins: [
    openapi({
      openapiVersion: '3.0',
      metadata: {
        title: 'Payload CMS REST API',
        version: '1.0.0',
        description: 'Auto-generated OpenAPI specification for collections and auth endpoints',
      },
      adjustGeneratedSpec: (spec) => {
        if (spec.components) {
          spec.components.securitySchemes = {
            ...spec.components.securitySchemes,
            ApiKey: {
              type: 'apiKey',
              name: 'Authorization',
              in: 'header',
              description:
                'API key authorization (e.g. "users API-Key <api-key>" or "Bearer <token>")',
            },
          }
        }
        return spec
      },
    }),
    scalar({
      docsUrl: '/docs',
    }),
    secureOpenApiDocsPlugin,
    endpointAuthMiddlewarePlugin,
  ],
  endpoints: [systemHealthPayloadEndpoint],
  collections: [Users, Posts],
  editor: lexicalEditor(),
  secret:
    process.env.PAYLOAD_SECRET ||
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    idType: 'uuidv7',
    pool: {
      connectionString: databaseUri,
      user: process.env.PGUSER || 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    },
  }),
})
