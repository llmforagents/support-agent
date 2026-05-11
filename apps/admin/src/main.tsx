import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './app'
import './index.css'

const queryClient = new QueryClient()

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

if (import.meta.env.DEV) {
  void Promise.all([
    import('react'),
    import('react-dom'),
    import('@axe-core/react'),
  ]).then(([ReactMod, ReactDOMMod, axeMod]) => {
    const axe = axeMod.default
    void axe(ReactMod, ReactDOMMod, 1000)
  }).catch(() => undefined)
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
