import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/presentation/hooks/useAuth'
import { Login } from '@/presentation/routes/Login'
import { Onboarding } from '@/presentation/routes/Onboarding'
import { Conversations } from '@/presentation/routes/Conversations'
import { KnowledgeBase } from '@/presentation/routes/KnowledgeBase'

function RequireAuth({ children }: { readonly children: React.JSX.Element }): React.JSX.Element {
  const { auth } = useAuth()
  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span role="status" aria-live="polite" className="text-sm text-gray-600">Loading…</span>
      </div>
    )
  }
  if (auth.status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }
  return children
}

function BootRedirect(): React.JSX.Element {
  const { auth } = useAuth()
  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span role="status" aria-live="polite" className="text-sm text-gray-600">Loading…</span>
      </div>
    )
  }
  if (auth.status === 'authenticated') {
    return <Navigate to="/conversations" replace />
  }
  // unauthenticated — check if first-time setup is needed
  return <Navigate to="/login" replace />
}

export function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<BootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route
            path="/conversations"
            element={
              <RequireAuth>
                <Conversations />
              </RequireAuth>
            }
          />
          <Route
            path="/knowledge-base"
            element={
              <RequireAuth>
                <KnowledgeBase />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
