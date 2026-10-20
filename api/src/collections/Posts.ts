import { POSTS_COLLECTION_SLUG, SUPERADMIN_USER_ROLE } from '../constants'
import { postsStatsPayloadEndpoint } from '../handlers/posts'
import type { CustomCollectionConfig } from '../utils/endpointAuthUtils'
import { validatePostSlugField, validatePostTitleField } from '../validations/postsValidation'

export const Posts: CustomCollectionConfig = {
  slug: POSTS_COLLECTION_SLUG,
  lockDocuments: false,
  access: {
    admin: ({ req: { user } }) => user?.role === SUPERADMIN_USER_ROLE,
    read: () => true,
    create: ({ req: { user } }) => user?.role === SUPERADMIN_USER_ROLE,
    update: ({ req: { user } }) => user?.role === SUPERADMIN_USER_ROLE,
    delete: ({ req: { user } }) => user?.role === SUPERADMIN_USER_ROLE,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'status', 'createdAt'],
  },
  endpoints: [postsStatsPayloadEndpoint],
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      validate: validatePostTitleField,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: validatePostSlugField,
    },
    {
      name: 'content',
      type: 'richText',
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [
        {
          label: 'Draft',
          value: 'draft',
        },
        {
          label: 'Published',
          value: 'published',
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
    },
  ],
}
