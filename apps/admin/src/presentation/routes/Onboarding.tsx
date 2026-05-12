import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { OnboardingWizard } from '@/presentation/components/onboarding/OnboardingWizard'
import { useAuth } from '@/presentation/hooks/useAuth'
import { apiClient, ApiError } from '@/infrastructure/apiClient'

type CheckState =
  | { readonly status: 'checking' }
  | { readonly status: 'needs-wizard' }
  | { readonly status: 'completed' }
  | { readonly status: 'unauth' }

/**
 * Guards /onboarding so an admin that already finished the wizard doesn't
 * land back on the welcome step when they bookmark or refresh the URL.
 *
 * Decision tree:
 * - Auth still loading              → "checking"
 * - Unauthenticated + needs-admin   → render wizard (it handles bootstrap)
 * - Unauthenticated + admin exists  → redirect to /login
 * - Authenticated + onboarding done → redirect to /conversations
 * - Authenticated + onboarding open → render wizard from current step
 */
export function Onboarding(): React.JSX.Element {
  const { auth } = useAuth()
  const [check, setCheck] = useState<CheckState>({ status: 'checking' })

  useEffect(() => {
    if (auth.status === 'loading') {
      setCheck({ status: 'checking' })
      return
    }
    if (auth.status === 'needs-onboarding') {
      setCheck({ status: 'needs-wizard' })
      return
    }
    if (auth.status === 'unauthenticated') {
      setCheck({ status: 'unauth' })
      return
    }
    // authenticated — ask the backend whether onboarding is complete.
    let cancelled = false
    void apiClient
      .configGet()
      .then((cfg) => {
        if (cancelled) return
        setCheck({ status: cfg.onboardingCompleted === true ? 'completed' : 'needs-wizard' })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // If config can't be read (404, etc.), assume onboarding is still open.
        if (err instanceof ApiError && err.status === 404) {
          setCheck({ status: 'needs-wizard' })
        } else {
          setCheck({ status: 'needs-wizard' })
        }
      })
    return () => { cancelled = true }
  }, [auth.status])

  if (check.status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span role="status" aria-live="polite" className="text-sm text-gray-600">Loading…</span>
      </div>
    )
  }
  if (check.status === 'completed') return <Navigate to="/conversations" replace />
  if (check.status === 'unauth') return <Navigate to="/login" replace />

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <OnboardingWizard />
    </div>
  )
}
