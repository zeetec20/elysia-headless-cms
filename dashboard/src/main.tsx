import React from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './styles.css'
import '@refinedev/antd/dist/reset.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element #root not found in index.html markup')
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
