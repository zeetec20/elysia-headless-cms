import { Create, useForm } from '@refinedev/antd'
import { Col, DatePicker, Form, Input, Row, Select } from 'antd'
import dayjs from 'dayjs'

import { LexicalRichTextEditor } from '../../components/lexical'
import type { PayloadPostStatus } from '../../types'

const statusFormOptions = [
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
]

const PostsCreate = () => {
  const { formProps, saveButtonProps } = useForm()

  return (
    <Create title="Create post" saveButtonProps={saveButtonProps}>
      <Form
        {...formProps}
        layout="vertical"
        initialValues={{ status: 'draft' as PayloadPostStatus, content: undefined }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Title"
              name="title"
              rules={[
                { required: true, message: 'Post title must be between 3 and 100 characters long' },
              ]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Slug"
              name="slug"
              extra='Lowercase alphanumeric characters separated by single hyphens (e.g. "my-first-post")'
              rules={[
                {
                  required: true,
                  message:
                    'Post slug must be lowercase alphanumeric characters separated by single hyphens',
                },
              ]}
            >
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Status" name="status">
              <Select options={statusFormOptions} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Published at"
              name="publishedAt"
              getValueProps={(value?: string | null) => ({
                value: value ? dayjs(value) : undefined,
              })}
              getValueFromEvent={(date: dayjs.Dayjs | null) => (date ? date.toISOString() : null)}
            >
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Content" name="content">
          <LexicalRichTextEditor />
        </Form.Item>
      </Form>
    </Create>
  )
}

export default PostsCreate
