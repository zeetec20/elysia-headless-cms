import { getPayload } from 'payload'
import config from '@/payload.config'

// NOTE: Idempotent seeding equivalent to src/migrations/20261019_000000_seed.ts. The CLI
// `payload migrate` prompts destructively when dev schema push already created the schema,
// so seeding runs through the local API instead.
const seedPayloadElysiaProject = async () => {
  const payload = await getPayload({ config })

  const existingUsers = await payload.find({
    collection: 'users',
    where: { email: { equals: 'admin@example.com' } },
    limit: 1,
    overrideAccess: true,
  })

  if (existingUsers.totalDocs === 0) {
    await payload.create({
      collection: 'users',
      data: {
        email: 'admin@example.com',
        password: 'password123',
        role: 'superadmin',
      },
      context: { system: true },
      overrideAccess: true,
    })
    payload.logger.info('✓ Seeded initial admin user: admin@example.com / password123')
  } else {
    payload.logger.info('• Admin user already seeded: admin@example.com')
  }

  const existingPosts = await payload.find({
    collection: 'posts',
    where: { slug: { equals: 'hello-world' } },
    limit: 1,
    overrideAccess: true,
  })

  if (existingPosts.totalDocs === 0) {
    await payload.create({
      collection: 'posts',
      overrideAccess: true,
      data: {
        title: 'Hello World from Bun',
        slug: 'hello-world',
        status: 'published',
        publishedAt: new Date().toISOString(),
        content: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'text',
                    text: 'Payload CMS is running natively on the Bun runtime with PostgreSQL storage.',
                    version: 1,
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
          },
        },
      },
    })
    payload.logger.info('✓ Seeded initial sample post: "Hello World from Bun"')
  } else {
    payload.logger.info('• Sample post already seeded: "Hello World from Bun"')
  }

  process.exit(0)
}

seedPayloadElysiaProject().catch((error) => {
  process.stderr.write(`Failed to seed: ${String(error)}\n`)
  process.exit(1)
})
