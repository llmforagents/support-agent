import React, { useState } from 'react'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'
import { apiClient, ApiError } from '@/infrastructure/apiClient'

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
      if (err instanceof ApiError && err.status === 409) {
        setError('An admin account already exists.')
      } else {
        setError('Failed to create account. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Create Admin Account</h2>
        <p className="mt-1 text-sm text-gray-500">
          This will be your login for the support dashboard.
        </p>
      </div>
      <form
        onSubmit={(e) => { void handleSubmit(e) }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="ca-email">Email</Label>
          <Input
            id="ca-email"
            type="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value) }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ca-password">Password</Label>
          <Input
            id="ca-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => { setPassword(e.target.value) }}
          />
          <p className="text-xs text-gray-400">Minimum 8 characters</p>
        </div>
        {error !== null && (
          <p role="alert" className="text-sm text-red-600">{error}</p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </div>
  )
}
