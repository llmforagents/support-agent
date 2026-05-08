import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { apiClient, ApiError } from '@/infrastructure/apiClient'

interface MeResponse {
  readonly email: string
}

type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'authenticated'; readonly email: string }
  | { readonly status: 'unauthenticated' }

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
      setAuth({ status: 'authenticated', email: me.email })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuth({ status: 'unauthenticated' })
      } else {
        setAuth({ status: 'unauthenticated' })
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
