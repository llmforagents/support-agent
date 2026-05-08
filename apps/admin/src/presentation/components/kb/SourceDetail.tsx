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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <Card className="max-h-[80vh] w-full max-w-2xl space-y-4 overflow-y-auto p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{sourceQ.data?.name ?? '…'}</h2>
          <Button variant="ghost" onClick={onClose}>
            {t('kb.detail.close')}
          </Button>
        </div>
        {sourceQ.data !== undefined && (
          <div className="space-y-1 text-sm text-zinc-600">
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
              <div className="text-red-600">
                Error: {JSON.stringify((state as ErrorState).error)}
              </div>
            )}
          </div>
        )}
        {previewQ.data !== undefined && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t('kb.detail.chunks')}</h3>
            <div className="space-y-2">
              {previewQ.data.chunks.map((c) => (
                <div key={c.id} className="rounded bg-zinc-50 p-3 text-xs">
                  <div className="mb-1 text-zinc-500">[{c.sourceName}]</div>
                  <div className="whitespace-pre-wrap">{c.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
