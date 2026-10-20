import { DeleteButton, EditButton, EmailField, List, useTable } from '@refinedev/antd'
import { useGetIdentity } from '@refinedev/core'
import { Input, Space, Table, Tag } from 'antd'
import dayjs from 'dayjs'

import type { PayloadUser } from '@/types'

const roleColors: Record<string, string> = {
  superadmin: 'volcano',
  guest: 'blue',
}

const UsersList = () => {
  const { data: identity } = useGetIdentity<{ role?: string }>()
  const { tableProps, setFilters, filters } = useTable<PayloadUser>()

  const emailFilter = filters.find((filter) => 'field' in filter && filter.field === 'email')

  return (
    <List title="Users" canCreate>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="Search email"
          allowClear
          defaultValue={emailFilter && 'field' in emailFilter ? emailFilter.value : undefined}
          onSearch={(value) =>
            setFilters([{ field: 'email', operator: 'contains', value: value || undefined }])
          }
          style={{ width: 240 }}
        />
      </Space>
      <Table {...tableProps} rowKey="id">
        <Table.Column<PayloadUser>
          dataIndex="email"
          title="Email"
          render={(value: string) => <EmailField value={value} />}
        />
        <Table.Column<PayloadUser>
          dataIndex="role"
          title="Role"
          filters={[
            { text: 'Super Admin', value: 'superadmin' },
            { text: 'Guest', value: 'guest' },
          ]}
          filterMultiple={false}
          render={(value: string) => <Tag color={roleColors[value] ?? 'default'}>{value}</Tag>}
        />
        <Table.Column<PayloadUser>
          dataIndex="createdAt"
          title="Created"
          sorter
          render={(value: string) => dayjs(value).format('YYYY-MM-DD HH:mm')}
        />
        <Table.Column<PayloadUser>
          title="Actions"
          dataIndex="actions"
          fixed="right"
          render={(_, record) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              {identity?.role === 'superadmin' ? (
                <DeleteButton hideText size="small" recordItemId={record.id} />
              ) : null}
            </Space>
          )}
        />
      </Table>
    </List>
  )
}

export default UsersList
