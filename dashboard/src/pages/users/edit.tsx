import { Edit, useForm } from '@refinedev/antd'
import { useGetIdentity } from '@refinedev/core'
import { Checkbox, Col, Form, Input, Row, Select, Typography } from 'antd'

import type { PayloadUser } from '@/types'

const { Text } = Typography

const roleFormOptions = [
  { label: 'Super Admin', value: 'superadmin' },
  { label: 'Guest', value: 'guest' },
]

const UsersEdit = () => {
  const { data: identity } = useGetIdentity<{ role?: string; id?: string }>()
  const { formProps, saveButtonProps, formLoading, query } = useForm<PayloadUser>()

  const user = (query?.data?.data ?? undefined) as PayloadUser | undefined
  const isSuperAdmin = identity?.role === 'superadmin'
  const isSelf = identity?.id === user?.id

  // NOTE: Password submits only when the operator typed one; an omitted password keeps the
  // stored hash server-side per Payload update semantics.
  const handleSubmit = async (values: Record<string, unknown>) => {
    const { password, ...rest } = values
    const payloadVariables = password ? { ...rest, password } : rest
    await formProps.onFinish?.(payloadVariables)
  }

  return (
    <Edit
      title="Edit user"
      saveButtonProps={saveButtonProps}
      isLoading={formLoading}
      canDelete={isSuperAdmin}
    >
      <Form {...formProps} onFinish={handleSubmit} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Email"
              name="email"
              rules={[{ type: 'email', message: 'Please enter a valid email address' }]}
            >
              <Input type="email" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Password"
              name="password"
              extra={isSelf ? 'Leave blank to keep the current password.' : undefined}
            >
              <Input.Password placeholder="Leave blank to keep current" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          label="Role"
          name="role"
          extra={isSuperAdmin ? undefined : 'Only superadmins can change roles.'}
        >
          <Select options={roleFormOptions} disabled={!isSuperAdmin} />
        </Form.Item>
        <Form.Item
          label="Enable API key"
          name="enableAPIKey"
          valuePropName="checked"
          extra="Enabling generates an API key usable as 'users API-Key <key>' in the Authorization header."
        >
          <Checkbox>Enable API key</Checkbox>
        </Form.Item>
        {user?.apiKey ? (
          <Form.Item label="API key">
            <Input readOnly value={user.apiKey} />
            <Text type="secondary">Use as "Authorization: users API-Key &lt;key&gt;"</Text>
          </Form.Item>
        ) : null}
      </Form>
    </Edit>
  )
}

export default UsersEdit
