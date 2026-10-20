import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { resolveInitialAdminCredentials } from '../utils/payloadSecurityUtils'

export const up = async ({ payload, req }: MigrateUpArgs): Promise<void> => {
  const initialAdmin = resolveInitialAdminCredentials()

  if (initialAdmin) {
    const existingUsers = await payload.find({
      collection: 'users',
      where: {
        email: {
          equals: initialAdmin.email,
        },
      },
      limit: 1,
      req,
    })

    if (existingUsers.totalDocs === 0) {
      await payload.create({
        collection: 'users',
        data: {
          email: initialAdmin.email,
          password: initialAdmin.password,
          role: 'superadmin',
        },
        context: { system: true },
        req,
      })
      payload.logger.info(`✓ Seeded initial admin user: ${initialAdmin.email}`)
    } else {
      await payload.update({
        collection: 'users',
        id: existingUsers.docs[0].id,
        data: {
          role: 'superadmin',
        },
        context: { system: true },
        req,
      })
      payload.logger.info('✓ Updated initial admin user to superadmin role')
    }
  } else {
    payload.logger.warn(
      'Skipping initial admin seed: set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD outside local development',
    )
  }

  const existingPosts = await payload.find({
    collection: 'posts',
    where: {
      slug: {
        equals: 'hello-world',
      },
    },
    limit: 1,
    req,
  })

  if (existingPosts.totalDocs === 0) {
    await payload.create({
      collection: 'posts',
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
      req,
    })
    payload.logger.info('✓ Seeded initial sample post: "Hello World from Bun"')
  }
}

export const down = async ({ payload, req }: MigrateDownArgs): Promise<void> => {
  const initialAdmin = resolveInitialAdminCredentials()

  await payload.delete({
    collection: 'posts',
    where: {
      slug: {
        equals: 'hello-world',
      },
    },
    req,
  })

  if (initialAdmin) {
    await payload.delete({
      collection: 'users',
      where: {
        email: {
          equals: initialAdmin.email,
        },
      },
      req,
    })
  }
}
