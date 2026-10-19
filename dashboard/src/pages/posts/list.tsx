import { DeleteButton, EditButton, List, useTable } from '@refinedev/antd'
import { useGetIdentity } from '@refinedev/core'
import { Input, Space, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'

import type { PayloadPost } from '../../types'

const { Link } = Typography

const statusColors: Record<string, string> = {
  draft: 'gold',
  published: 'green',
}

const PostsList = () => {
  const { data: identity } = useGetIdentity<{ role?: string }>()
  const { tableProps, setFilters, filters } = useTable<PayloadPost>()

  const titleFilter = filters.find((filter) => 'field' in filter && filter.field === 'title')

  return (
    <List title="Posts">
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="Search title"
          allowClear
          defaultValue={titleFilter && 'field' in titleFilter ? titleFilter.value : undefined}
          onSearch={(value) =>
            setFilters([{ field: 'title', operator: 'contains', value: value || undefined }])
          }
          style={{ width: 240 }}
        />
      </Space>
      <Table {...tableProps} rowKey="id">
        <Table.Column<PayloadPost>
          dataIndex="title"
          title="Title"
          render={(value: string, record) => <Link href={`/posts/${record.id}/edit`}>{value}</Link>}
        />
        <Table.Column<PayloadPost> dataIndex="slug" title="Slug" />
        <Table.Column<PayloadPost>
          dataIndex="status"
          title="Status"
          filters={[
            { text: 'Draft', value: 'draft' },
            { text: 'Published', value: 'published' },
          ]}
          filterMultiple={false}
          render={(value: string) => <Tag color={statusColors[value] ?? 'default'}>{value}</Tag>}
        />
        <Table.Column<PayloadPost>
          dataIndex="publishedAt"
          title="Published at"
          render={(value: string | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—')}
        />
        <Table.Column<PayloadPost>
          dataIndex="createdAt"
          title="Created"
          sorter
          render={(value: string) => dayjs(value).format('YYYY-MM-DD HH:mm')}
        />
        {identity?.role === 'superadmin' ? (
          <Table.Column<PayloadPost>
            title="Actions"
            dataIndex="actions"
            fixed="right"
            render={(_, record) => (
              <Space>
                <EditButton hideText size="small" recordItemId={record.id} />
                <DeleteButton hideText size="small" recordItemId={record.id} />
              </Space>
            )}
          />
        ) : null}
      </Table>
    </List>
  )
}

export default PostsList
