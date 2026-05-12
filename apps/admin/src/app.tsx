import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/presentation/hooks/useAuth'
import { Login } from '@/presentation/routes/Login'
import { Onboarding } from '@/presentation/routes/Onboarding'
import { Conversations } from '@/presentation/routes/Conversations'
import { KnowledgeBase } from '@/presentation/routes/KnowledgeBase'

function Loading(): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <span role="status" aria-live="polite" className="text-sm text-gray-600">Loading…</span>
    </div>
  )
}

function RequireAuth({ children }: { readonly children: React.JSX.Element }): React.JSX.Element {
  const { auth } = useAuth()
  if (auth.status === 'loading') return <Loading />
  if (auth.status === 'needs-onboarding') return <Navigate to="/onboarding" replace />
  if (auth.status === 'unauthenticated') return <Navigate to="/login" replace />
  return children
}

function BootRedirect(): React.JSX.Element {
  const { auth } = useAuth()
  if (auth.status === 'loading') return <Loading />
  if (auth.status === 'authenticated') return <Navigate to="/conversations" replace />
  if (auth.status === 'needs-onboarding') return <Navigate to="/onboarding" replace />
  return <Navigate to="/login" replace />
}

// Wraps /login so first-run installs land on the onboarding wizard instead of
// staring at a login form with no admin to log into.
function LoginOrOnboarding({ element }: { readonly element: React.JSX.Element }): React.JSX.Element {
  const { auth } = useAuth()
  if (auth.status === 'loading') return <Loading />
  if (auth.status === 'authenticated') return <Navigate to="/conversations" replace />
  if (auth.status === 'needs-onboarding') return <Navigate to="/onboarding" replace />
  return element
}

export function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<BootRedirect />} />
          <Route path="/login" element={<LoginOrOnboarding element={<Login />} />} />
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
