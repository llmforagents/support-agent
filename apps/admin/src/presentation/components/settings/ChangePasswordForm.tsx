import React, { useId, useState } from 'react'
import { MIN_PASSWORD_LEN } from '@support/shared'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/presentation/components/ui/card'
import { apiClient, ApiError } from '@/infrastructure/apiClient'

export function ChangePasswordForm(): React.JSX.Element {
  const currentId = useId()
  const newId = useId()
  const confirmId = useId()
  const errorId = useId()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (current.length === 0) {
      setError('Enter your current password.')
      return
    }
    if (next.length < MIN_PASSWORD_LEN) {
      setError(`New password is too short — minimum ${String(MIN_PASSWORD_LEN)} characters.`)
      return
    }
    if (next !== confirm) {
      setError("New passwords don't match.")
      return
    }
    if (next === current) {
      setError('New password must be different from the current one.')
      return
    }
    setLoading(true)
    try {
      await apiClient.changePassword(current, next)
      setSuccess(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError('Current password is incorrect.')
        else setError(err.userMessage)
      } else {
        setError('Could not change password. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>Pick a new password (minimum {MIN_PASSWORD_LEN} characters). You won't be signed out.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor={currentId}>Current password</Label>
            <Input
              id={currentId}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => { setCurrent(e.target.value) }}
              aria-invalid={error !== null}
              aria-describedby={error !== null ? errorId : undefined}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={newId}>New password</Label>
            <Input
              id={newId}
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => { setNext(e.target.value) }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={confirmId}>Confirm new password</Label>
            <Input
              id={confirmId}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value) }}
            />
          </div>
          {error !== null && (
            <p id={errorId} role="alert" className="text-sm text-red-700">{error}</p>
          )}
          {success && (
            <p role="status" className="text-sm text-green-700">Password updated successfully.</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Saving…' : 'Update password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
