import React, { useState, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/presentation/hooks/useAuth'
import { Button } from '@/presentation/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/presentation/components/ui/card'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'
import { ApiError } from '@/infrastructure/apiClient'
import { t } from '@/lib/i18n'

export function Login(): React.JSX.Element {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const emailId = useId()
  const passwordId = useId()
  const errorId = useId()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      void navigate('/conversations')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(t('login.error.invalidCredentials'))
      } else {
        setError(t('login.error.generic'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* h1 — page-level title. CardTitle defaults to h3, which would skip levels. */}
          <h1 className="text-lg font-semibold leading-none tracking-tight text-gray-900">
            {t('login.title')}
          </h1>
          <CardDescription>{t('login.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              void handleSubmit(e)
            }}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor={emailId}>{t('login.email')}</Label>
              <Input
                id={emailId}
                type="email"
                autoComplete="email"
                required
                aria-invalid={error !== null}
                aria-describedby={error !== null ? errorId : undefined}
                value={email}
                onChange={(e) => { setEmail(e.target.value) }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={passwordId}>{t('login.password')}</Label>
              <Input
                id={passwordId}
                type="password"
                autoComplete="current-password"
                required
                aria-invalid={error !== null}
                aria-describedby={error !== null ? errorId : undefined}
                value={password}
                onChange={(e) => { setPassword(e.target.value) }}
              />
            </div>
            {error !== null && (
              <p id={errorId} role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('login.submitting') : t('login.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
