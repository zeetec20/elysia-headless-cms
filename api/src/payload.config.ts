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
import { resolvePayloadAuthSecret } from './utils/payloadSecurityUtils'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const payloadSecret = resolvePayloadAuthSecret()
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
  auth: {
    jwtOrder: ['Bearer'],
  },
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
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'JWT access token from POST /api/users/login',
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
  secret: payloadSecret,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    idType: 'uuidv7',
    migrationDir: path.resolve(dirname, 'migrations'),
    pool: {
      connectionString: databaseUri,
      user: process.env.PGUSER || 'postgres',
      max: Number(process.env.DB_POOL_MAX) || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 10000,
    },
  }),
})
