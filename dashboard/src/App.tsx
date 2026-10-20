import {
  AuthPage,
  ErrorComponent,
  RefineThemes,
  ThemedLayout,
  useNotificationProvider,
} from '@refinedev/antd'
import { Authenticated, CanAccess, Refine } from '@refinedev/core'
import routerProvider, { NavigateToResource, UnsavedChangesNotifier } from '@refinedev/react-router'
import { App as AntdApp, ConfigProvider } from 'antd'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'

import { authProvider, createPayloadAccessControlProvider } from '@/api/auth'
import { createPayloadDataProvider } from '@/api/dataProvider'
import ThemedSiderWithLogout from '@/components/themedSiderWithLogout'
import DashboardPage from '@/pages/dashboard'
import PostsCreate from '@/pages/posts/create'
import PostsEdit from '@/pages/posts/edit'
import PostsList from '@/pages/posts/list'
import UsersCreate from '@/pages/users/create'
import UsersEdit from '@/pages/users/edit'
import UsersList from '@/pages/users/list'

// Refine hides these links with `false`, but its prop type only accepts ReactNode.
const hiddenAuthPageLink = false as unknown as ReactNode

export const App = () => (
  <BrowserRouter>
    <ConfigProvider theme={RefineThemes.Blue}>
      <AntdApp>
        <Refine
          routerProvider={routerProvider}
          dataProvider={createPayloadDataProvider()}
          authProvider={authProvider}
          accessControlProvider={createPayloadAccessControlProvider()}
          notificationProvider={useNotificationProvider}
          resources={[
            {
              name: 'posts',
              list: '/posts',
              create: '/posts/create',
              edit: '/posts/:id/edit',
            },
            {
              name: 'users',
              list: '/users',
              create: '/users/create',
              edit: '/users/:id/edit',
            },
          ]}
          options={{ syncWithLocation: true, warnWhenUnsavedChanges: true }}
        >
          <Routes>
            <Route
              element={
                <Authenticated key="auth-pages" fallback={<Outlet />}>
                  <NavigateToResource resource="posts" />
                </Authenticated>
              }
            >
              <Route
                path="/login"
                element={
                  <AuthPage
                    type="login"
                    forgotPasswordLink={hiddenAuthPageLink}
                    registerLink={hiddenAuthPageLink}
                  />
                }
              />
              <Route path="*" element={<ErrorComponent />} />
            </Route>
            <Route
              element={
                <Authenticated key="auth-layout" redirectOnFail="/login">
                  <ThemedLayout Sider={ThemedSiderWithLogout}>
                    <Outlet />
                  </ThemedLayout>
                </Authenticated>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/posts" element={<Outlet />}>
                <Route
                  index
                  element={
                    <CanAccess
                      resource="posts"
                      action="list"
                      fallback={<Navigate to="/" replace />}
                    >
                      <PostsList />
                    </CanAccess>
                  }
                />
                <Route
                  path="create"
                  element={
                    <CanAccess
                      resource="posts"
                      action="create"
                      fallback={<Navigate to="/posts" replace />}
                    >
                      <PostsCreate />
                    </CanAccess>
                  }
                />
                <Route
                  path=":id/edit"
                  element={
                    <CanAccess
                      resource="posts"
                      action="edit"
                      fallback={<Navigate to="/posts" replace />}
                    >
                      <PostsEdit />
                    </CanAccess>
                  }
                />
              </Route>
              <Route path="/users" element={<Outlet />}>
                <Route index element={<UsersList />} />
                <Route path="create" element={<UsersCreate />} />
                <Route path=":id/edit" element={<UsersEdit />} />
              </Route>
              <Route path="*" element={<ErrorComponent />} />
            </Route>
          </Routes>
          <UnsavedChangesNotifier />
        </Refine>
      </AntdApp>
    </ConfigProvider>
  </BrowserRouter>
)

export default App
