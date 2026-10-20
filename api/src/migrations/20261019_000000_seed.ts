import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { POSTS_COLLECTION_SLUG, SUPERADMIN_USER_ROLE, USERS_COLLECTION_SLUG } from '../constants'
import { resolveInitialAdminCredentials } from '../utils/payloadSecurityUtils'

export const up = async ({ payload, req }: MigrateUpArgs): Promise<void> => {
  const initialAdmin = resolveInitialAdminCredentials()

  if (initialAdmin) {
    const existingUsers = await payload.find({
      collection: USERS_COLLECTION_SLUG,
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
        collection: USERS_COLLECTION_SLUG,
        data: {
          email: initialAdmin.email,
          password: initialAdmin.password,
          role: SUPERADMIN_USER_ROLE,
        },
        context: { system: true },
        req,
      })
      payload.logger.info(`✓ Seeded initial admin user: ${initialAdmin.email}`)
    } else {
      await payload.update({
        collection: USERS_COLLECTION_SLUG,
        id: existingUsers.docs[0].id,
        data: {
          role: SUPERADMIN_USER_ROLE,
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
    collection: POSTS_COLLECTION_SLUG,
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
      collection: POSTS_COLLECTION_SLUG,
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
    collection: POSTS_COLLECTION_SLUG,
    where: {
      slug: {
        equals: 'hello-world',
      },
    },
    req,
  })

  if (initialAdmin) {
    await payload.delete({
      collection: USERS_COLLECTION_SLUG,
      where: {
        email: {
          equals: initialAdmin.email,
        },
      },
      req,
    })
  }
}
