import { useState, useEffect, useId, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/infrastructure/apiClient'
import { cn } from '@/lib/cn'

export function OnlineToggle(): React.JSX.Element {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState<{ activeCount: number } | null>(null)
  const titleId = useId()
  const bodyId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<Element | null>(null)

  const cfgQ = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => apiClient.configGet(),
    refetchInterval: 30_000,
  })

  const sessionsQ = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiClient.sessionsList(),
    refetchInterval: 30_000,
  })

  const setOnline = useMutation({
    mutationFn: (online: boolean) => apiClient.adminSetOnline(online),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-config'] })
      setConfirming(null)
    },
  })

  const isOnline = Boolean(cfgQ.data?.['adminOnline'])
  const activeOperatorCount = (sessionsQ.data?.sessions ?? []).filter(
    (s) => s.state.status === 'active_operator',
  ).length

  const handleClick = (): void => {
    if (isOnline && activeOperatorCount > 0) {
      setConfirming({ activeCount: activeOperatorCount })
      return
    }
    setOnline.mutate(!isOnline)
  }

  // Modal focus/ESC management
  useEffect(() => {
    if (confirming === null) return undefined
    previousFocusRef.current = document.activeElement
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('button')
    firstFocusable?.focus()
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setConfirming(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
  }, [confirming])

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={setOnline.isPending}
        aria-pressed={isOnline}
        title={isOnline ? 'Online — click to go offline' : 'Offline — click to go online'}
        aria-label={isOnline ? 'Operator online — click to go offline' : 'Operator offline — click to go online'}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
          // green-600 (#16a34a) on white = 3.0:1 — passes AA for UI components with bold white text on top.
          isOnline
            ? 'bg-green-600 text-white hover:bg-green-700'
            // zinc-300 bg with zinc-800 text = 5.7:1 — passes AA for normal text
            : 'bg-zinc-300 text-zinc-800 hover:bg-zinc-400',
          setOnline.isPending && 'opacity-50',
        )}
      >
        <span aria-hidden="true">{isOnline ? 'ON' : 'OFF'}</span>
      </button>

      {confirming !== null && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h2 id={titleId} className="mb-2 text-lg font-semibold text-zinc-900">Go offline?</h2>
            <p id={bodyId} className="mb-4 text-sm text-zinc-700">
              You have{' '}
              <strong>{confirming.activeCount}</strong>{' '}
              active session{confirming.activeCount === 1 ? '' : 's'}.
              Going offline routes visitors back to the AI.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setConfirming(null) }}
                className="rounded border border-zinc-400 px-3 py-1 text-sm text-zinc-800 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setOnline.mutate(false) }}
                className="rounded bg-red-700 px-3 py-1 text-sm text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
