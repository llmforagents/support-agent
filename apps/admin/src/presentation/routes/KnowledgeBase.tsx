import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/infrastructure/apiClient'
import { Sidebar } from '@/presentation/components/Sidebar'
import { Button } from '@/presentation/components/ui/button'
import { Card } from '@/presentation/components/ui/card'
import { UploadModal } from '@/presentation/components/kb/UploadModal'
import { SourceDetail } from '@/presentation/components/kb/SourceDetail'
import { t } from '@/lib/i18n'

export function KnowledgeBase(): React.JSX.Element {
  const qc = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const sourcesQ = useQuery({
    queryKey: ['sources'],
    queryFn: () => apiClient.sourcesList(),
    refetchInterval: 3000,
  })

  const reindex = useMutation({
    mutationFn: (id: string) => apiClient.sourceReindex(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['sources'] }) },
  })
  const del = useMutation({
    mutationFn: (id: string) => apiClient.sourceDelete(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['sources'] }) },
  })
  const setActive = useMutation({
    mutationFn: ({ id, active }: { readonly id: string; readonly active: boolean }) =>
      apiClient.sourceSetActive(id, active),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['sources'] }) },
  })

  const sources = sourcesQ.data?.sources ?? []
  const hasError = sources.some((s) => s.state.status === 'error')

  return (
    <div className="flex h-screen bg-zinc-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">{t('kb.title')}</h1>
            <Button onClick={() => { setUploadOpen(true) }}>{t('kb.upload')}</Button>
          </div>
          {hasError && (
            <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
              {t('kb.errorBanner')}
            </div>
          )}
          {sources.length === 0 ? (
            <Card className="p-8 text-center text-zinc-500">
              {t('kb.empty')}
            </Card>
          ) : (
            <Card className="divide-y divide-zinc-200">
              {sources.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="flex-1">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-zinc-500">
                      {s.sourceType.toUpperCase()} · status:{' '}
                      <strong>{s.state.status}</strong>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setActive.mutate({ id: s.id, active: !s.active }) }}
                      className={s.active ? 'text-indigo-600' : 'text-zinc-400'}
                    >
                      {s.active ? t('kb.activeOn') : t('kb.activeOff')}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSelectedId(s.id) }}
                    >
                      {t('kb.view')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { reindex.mutate(s.id) }}
                      disabled={s.state.status === 'ingesting'}
                    >
                      {t('kb.reindex')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(t('kb.confirmDelete'))) {
                          del.mutate(s.id)
                        }
                      }}
                    >
                      {t('kb.delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      </main>
      {uploadOpen && (
        <UploadModal onClose={() => { setUploadOpen(false) }} />
      )}
      {selectedId !== null && (
        <SourceDetail sourceId={selectedId} onClose={() => { setSelectedId(null) }} />
      )}
    </div>
  )
}
