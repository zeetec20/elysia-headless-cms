import {
  AuthPage,
  ErrorComponent,
  RefineThemes,
  ThemedLayout,
  useNotificationProvider,
} from '@refinedev/antd'
import { Authenticated, Refine } from '@refinedev/core'
import routerProvider, { NavigateToResource, UnsavedChangesNotifier } from '@refinedev/react-router'
import { App as AntdApp, ConfigProvider } from 'antd'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router'

import { authProvider } from './api/authProvider'
import { createPayloadDataProvider } from './api/dataProvider'
import DashboardPage from './pages/dashboard'
import PostsCreate from './pages/posts/create'
import PostsEdit from './pages/posts/edit'
import PostsList from './pages/posts/list'
import UsersCreate from './pages/users/create'
import UsersEdit from './pages/users/edit'
import UsersList from './pages/users/list'

export const App = () => (
  <BrowserRouter>
    <ConfigProvider theme={RefineThemes.Blue}>
      <AntdApp>
        <Refine
          routerProvider={routerProvider}
          dataProvider={createPayloadDataProvider()}
          authProvider={authProvider}
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
              <Route path="/login" element={<AuthPage type="login" />} />
              <Route path="*" element={<ErrorComponent />} />
            </Route>
            <Route
              element={
                <Authenticated key="auth-layout" redirectOnFail="/login">
                  <ThemedLayout>
                    <Outlet />
                  </ThemedLayout>
                </Authenticated>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/posts" element={<Outlet />}>
                <Route index element={<PostsList />} />
                <Route path="create" element={<PostsCreate />} />
                <Route path=":id/edit" element={<PostsEdit />} />
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
