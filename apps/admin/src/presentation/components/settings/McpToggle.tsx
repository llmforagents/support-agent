import { useState, type KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/infrastructure/apiClient'
import { Button } from '@/presentation/components/ui/button'
import { Card } from '@/presentation/components/ui/card'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'

/**
 * MCP toggle for the Settings page.
 *
 * Reads the current `mcpEnabled` flag from `/v1/admin/config` and surfaces it as a
 * switch. Flipping the switch opens a confirmation modal before issuing
 * `PUT /v1/admin/mcp { enabled }`. On success, invalidates the `admin-config`
 * cache so other surfaces (OnlineToggle, etc.) stay consistent.
 *
 * Pattern mirrors `OnlineToggle` (CSRF/credentials via apiClient) and
 * `UploadModal` (inline modal); the project does not use radix/shadcn primitives.
 */
export function McpToggle(): React.JSX.Element {
  const qc = useQueryClient()
  const [pending, setPending] = useState<boolean | null>(null)

  const cfgQ = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => apiClient.configGet(),
  })

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => apiClient.mcpSetEnabled(enabled),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-config'] })
      setPending(null)
    },
  })

  if (cfgQ.isLoading) {
    return (
      <Card className="p-6" aria-busy="true">
        <p className="text-sm text-zinc-500">{t('settings.loading')}</p>
      </Card>
    )
  }

  if (cfgQ.isError) {
    return (
      <Card className="p-6">
        <p className="text-sm text-red-600">{t('settings.loadError')}</p>
      </Card>
    )
  }

  const enabled = cfgQ.data?.mcpEnabled === true
  const requestedNext = pending !== null && pending !== enabled ? pending : null

  const askConfirm = (next: boolean): void => {
    if (toggle.isPending) return
    setPending(next)
  }

  const cancelConfirm = (): void => {
    setPending(null)
  }

  const confirm = (): void => {
    if (requestedNext === null) return
    toggle.mutate(requestedNext)
  }

  const onSwitchKeyDown = (ev: KeyboardEvent<HTMLButtonElement>): void => {
    if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault()
      askConfirm(!enabled)
    }
  }

  const mutationErrorMessage =
    toggle.error instanceof ApiError || toggle.error instanceof Error
      ? t('settings.mcp.toggleError')
      : null

  return (
    <Card className="p-6">
      <section aria-labelledby="mcp-heading" className="space-y-3">
        <h2 id="mcp-heading" className="text-lg font-semibold text-zinc-900">
          {t('settings.mcp.title')}
        </h2>
        <p id="mcp-description" className="text-sm text-zinc-600">
          {t('settings.mcp.description')}
        </p>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            role="switch"
            id="mcp-switch"
            aria-checked={enabled}
            aria-label={t('settings.mcp.toggleAriaLabel')}
            aria-describedby="mcp-description"
            onClick={() => { askConfirm(!enabled) }}
            onKeyDown={onSwitchKeyDown}
            disabled={toggle.isPending}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
              enabled ? 'bg-blue-600' : 'bg-zinc-300',
              toggle.isPending && 'opacity-50',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform',
                enabled ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
          <label htmlFor="mcp-switch" className="text-sm text-zinc-700 select-none">
            {enabled ? t('settings.mcp.statusOn') : t('settings.mcp.statusOff')}
          </label>
        </div>

        {mutationErrorMessage !== null && (
          <p role="alert" className="text-sm text-red-600">{mutationErrorMessage}</p>
        )}
      </section>

      {requestedNext !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mcp-confirm-title"
          aria-describedby="mcp-confirm-body"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        >
          <Card className="w-full max-w-md space-y-4 p-6">
            <h3 id="mcp-confirm-title" className="text-lg font-semibold text-zinc-900">
              {requestedNext ? t('settings.mcp.confirmTitleOn') : t('settings.mcp.confirmTitleOff')}
            </h3>
            <p id="mcp-confirm-body" className="text-sm text-zinc-600">
              {requestedNext ? t('settings.mcp.confirmBodyOn') : t('settings.mcp.confirmBodyOff')}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={cancelConfirm}
                disabled={toggle.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={confirm}
                disabled={toggle.isPending}
              >
                {t('common.confirm')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  )
}
