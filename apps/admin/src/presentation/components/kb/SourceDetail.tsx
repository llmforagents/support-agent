import { useEffect, useId, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/infrastructure/apiClient'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { t } from '@/lib/i18n'

type IngestingState = {
  readonly status: 'ingesting'
  readonly progress: { readonly processed: number; readonly total: number }
  readonly [k: string]: unknown
}

type ReadyState = {
  readonly status: 'ready'
  readonly chunkCount: number
  readonly [k: string]: unknown
}

type ErrorState = {
  readonly status: 'error'
  readonly error: unknown
  readonly [k: string]: unknown
}

export function SourceDetail({
  sourceId,
  onClose,
}: {
  readonly sourceId: string
  readonly onClose: () => void
}): React.JSX.Element {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<Element | null>(null)

  const sourceQ = useQuery({
    queryKey: ['source', sourceId],
    queryFn: () => apiClient.sourceGet(sourceId),
    refetchInterval: (q) => {
      const data = q.state.data
      return data !== undefined && data.state.status === 'ingesting' ? 1500 : false
    },
  })

  const previewQ = useQuery({
    queryKey: ['source-preview', sourceId],
    queryFn: () => apiClient.sourcePreview(sourceId, 5),
    enabled: sourceQ.data?.state.status === 'ready',
  })

  const state = sourceQ.data?.state

  // Focus + ESC management
  useEffect(() => {
    previousFocusRef.current = document.activeElement
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('button, [tabindex]')
    firstFocusable?.focus()
    return () => {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <Card className="max-h-[80vh] w-full max-w-2xl space-y-4 overflow-y-auto p-6">
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-xl font-semibold text-zinc-900">
            {sourceQ.data?.name ?? '…'}
          </h2>
          <Button variant="ghost" onClick={onClose} aria-label={t('a11y.closeModal')}>
            {t('kb.detail.close')}
          </Button>
        </div>
        {sourceQ.data !== undefined && (
          <div className="space-y-1 text-sm text-zinc-700">
            <div>
              Tipo: <strong>{sourceQ.data.sourceType.toUpperCase()}</strong>
            </div>
            <div>
              Status: <strong>{state?.status}</strong>
            </div>
            {state?.status === 'ingesting' && 'progress' in state && (
              <div>
                Progreso:{' '}
                {(state as IngestingState).progress.processed} /{' '}
                {(state as IngestingState).progress.total}
              </div>
            )}
            {state?.status === 'ready' && 'chunkCount' in state && (
              <div>Chunks: {(state as ReadyState).chunkCount}</div>
            )}
            {state?.status === 'error' && 'error' in state && (
              <div className="text-red-700" role="alert">
                Error: {JSON.stringify((state as ErrorState).error)}
              </div>
            )}
          </div>
        )}
        {previewQ.data !== undefined && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-900">{t('kb.detail.chunks')}</h3>
            <div className="space-y-2">
              {previewQ.data.chunks.map((c) => (
                <div key={c.id} className="rounded bg-zinc-50 p-3 text-xs">
                  <div className="mb-1 text-zinc-700">[{c.sourceName}]</div>
                  <div className="whitespace-pre-wrap text-zinc-900">{c.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
