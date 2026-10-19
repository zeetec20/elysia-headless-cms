import { postsStatsPayloadEndpoint } from '../handlers/posts'
import type { CustomCollectionConfig } from '../utils/endpointAuthUtils'
import { validatePostSlugField, validatePostTitleField } from '../validations/postsValidation'

export const Posts: CustomCollectionConfig = {
  slug: 'posts',
  access: {
    admin: ({ req: { user } }) => user?.role === 'superadmin',
    read: () => true,
    create: ({ req: { user } }) => user?.role === 'superadmin',
    update: ({ req: { user } }) => user?.role === 'superadmin',
    delete: ({ req: { user } }) => user?.role === 'superadmin',
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
