import React, { useState } from 'react'
import { MIN_PASSWORD_LEN } from '@support/shared'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'
import { apiClient, ApiError } from '@/infrastructure/apiClient'
import { t } from '@/lib/i18n'

interface CreateAdminStepProps {
  readonly onNext: () => void
}

export function CreateAdminStep({ onNext }: CreateAdminStepProps): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await apiClient.post('/auth/onboarding', { email, password })
      onNext()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError(t('createAdmin.error.conflict'))
        } else {
          // Surface the real backend message (e.g. "password: Too small: expected
          // string to have >=12 characters") instead of a generic "try again".
          setError(err.userMessage)
        }
      } else {
        setError(t('createAdmin.error.generic'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{t('createAdmin.title')}</h2>
        <p className="mt-1 text-sm text-gray-700">{t('createAdmin.description')}</p>
      </div>
      <form
        onSubmit={(e) => { void handleSubmit(e) }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="ca-email">{t('createAdmin.email')}</Label>
          <Input
            id="ca-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value) }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ca-password">{t('createAdmin.password')}</Label>
          <Input
            id="ca-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LEN}
            aria-describedby="ca-password-hint"
            value={password}
            onChange={(e) => { setPassword(e.target.value) }}
          />
          {/* gray-700 = 8:1 on white. gray-400 (2.9:1) was failing AA. */}
          <p id="ca-password-hint" className="text-xs text-gray-700">{t('createAdmin.passwordHint')}</p>
        </div>
        {error !== null && (
          <p role="alert" className="text-sm text-red-600">{error}</p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t('createAdmin.submitting') : t('createAdmin.submit')}
        </Button>
      </form>
    </div>
  )
}
