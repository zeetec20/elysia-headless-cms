import { Create, useForm } from '@refinedev/antd'
import { useGetIdentity } from '@refinedev/core'
import { Col, Form, Input, Row, Select } from 'antd'

const roleFormOptions = [
  { label: 'Super Admin', value: 'superadmin' },
  { label: 'Guest', value: 'guest' },
]

const UsersCreate = () => {
  const { data: identity } = useGetIdentity<{ role?: string }>()
  const { formProps, saveButtonProps } = useForm()

  const isSuperAdmin = identity?.role === 'superadmin'

  return (
    <Create title="Create user" saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical" initialValues={{ role: 'guest' }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Please enter a valid email address' },
              ]}
            >
              <Input type="email" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true, message: 'Password is required' }]}
            >
              <Input.Password />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          label="Role"
          name="role"
          extra={
            isSuperAdmin
              ? undefined
              : 'Only superadmins can assign other roles; new registrations become guests.'
          }
        >
          <Select options={roleFormOptions} disabled={!isSuperAdmin} />
        </Form.Item>
      </Form>
    </Create>
  )
}

export default UsersCreate
