import { LogoutOutlined } from '@ant-design/icons'
import { ThemedSider } from '@refinedev/antd'
import { useLogout } from '@refinedev/core'
import { App as AntdApp, Menu } from 'antd'
import type { FC } from 'react'

// NOTE: The built-in refine sider logout fires immediately; the dashboard requires an explicit
// confirmation step, so the sider render replaces it with a confirmed variant.
const ThemedSiderWithLogout: FC<Parameters<typeof ThemedSider>[0]> = (siderProps) => {
  const { modal } = AntdApp.useApp()
  const { mutate: logout } = useLogout()

  const confirmLogout = (): void => {
    modal.confirm({
      title: 'Log out',
      content: 'You will need to sign in again to use the dashboard.',
      okText: 'Log out',
      cancelText: 'Cancel',
      onOk: () => logout(),
    })
  }

  return (
    <ThemedSider
      {...siderProps}
      render={({ items }) => (
        <>
          {items}
          <Menu.Item key="logout" icon={<LogoutOutlined />} onClick={confirmLogout}>
            Log out
          </Menu.Item>
        </>
      )}
    />
  )
}

export default ThemedSiderWithLogout
