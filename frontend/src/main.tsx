import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

const RootApp = App as React.ComponentType

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
)
