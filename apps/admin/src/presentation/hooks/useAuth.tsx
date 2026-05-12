import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { apiClient, ApiError } from '@/infrastructure/apiClient'

interface MeResponse {
  readonly id: string
  readonly email: string
}

interface AuthStatusResponse {
  readonly adminExists: boolean
}

type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'authenticated'; readonly id: string; readonly email: string }
  | { readonly status: 'unauthenticated' }
  | { readonly status: 'needs-onboarding' }

interface AuthContextValue {
  readonly auth: AuthState
  readonly login: (email: string, password: string) => Promise<void>
  readonly logout: () => Promise<void>
  readonly refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const me = await apiClient.get<MeResponse>('/auth/me')
      setAuth({ status: 'authenticated', id: me.id, email: me.email })
      return
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) {
        setAuth({ status: 'unauthenticated' })
        return
      }
    }
    // 401 on /me — either no admin exists yet (needs onboarding) or admin
    // exists but the session cookie isn't present. Differentiate via /auth/status.
    try {
      const status = await apiClient.get<AuthStatusResponse>('/auth/status')
      setAuth({ status: status.adminExists ? 'unauthenticated' : 'needs-onboarding' })
    } catch {
      // If /auth/status is unreachable, default to login — onboarding has the
      // same error surface as a normal login when there genuinely is no admin.
      setAuth({ status: 'unauthenticated' })
    }
  }, [])

  useEffect(() => {
    void refresh()
    // refresh is stable (useCallback with no deps that change) — intentional empty dep array
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    await apiClient.post('/auth/login', { email, password })
    await refresh()
  }, [refresh])

  const logout = useCallback(async (): Promise<void> => {
    await apiClient.post('/auth/logout')
    setAuth({ status: 'unauthenticated' })
  }, [])

  return (
    <AuthContext.Provider value={{ auth, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
