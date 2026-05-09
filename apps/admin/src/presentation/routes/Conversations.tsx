import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, type Session } from '@/infrastructure/apiClient'
import { useAuth } from '@/presentation/hooks/useAuth'
import { useAdminStream } from '@/presentation/hooks/useAdminStream'
import { Sidebar } from '@/presentation/components/Sidebar'
import { SessionList } from '@/presentation/components/inbox/SessionList'
import { ConversationView } from '@/presentation/components/inbox/ConversationView'
import { ContextPanel } from '@/presentation/components/inbox/ContextPanel'

type StatusFilter = 'all' | 'handoff_requested' | 'active_operator' | 'active_ai'

export function Conversations(): React.JSX.Element {
  const { auth } = useAuth()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const sessionsQ = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiClient.sessionsList(),
    refetchInterval: 5_000,
  })

  const selectedSessionQ = useQuery({
    queryKey: ['session', selectedId],
    queryFn: () => apiClient.sessionGet(selectedId ?? ''),
    enabled: selectedId !== null,
    refetchInterval: 3_000,
  })

  const sessions: readonly Session[] = sessionsQ.data?.sessions ?? []
  const adminId = auth.status === 'authenticated' ? auth.id : null

  // SSE-driven live updates: invalidate queries on relevant inbox events.
  const handleAdminEvent = useCallback(
    (ev: { readonly type: string; readonly [k: string]: unknown }) => {
      if (
        ev.type === 'new_handoff' ||
        ev.type === 'session_claimed' ||
        ev.type === 'session_released' ||
        ev.type === 'session_closed'
      ) {
        void qc.invalidateQueries({ queryKey: ['sessions'] })
        if (selectedId !== null && ev['sessionId'] === selectedId) {
          void qc.invalidateQueries({ queryKey: ['session', selectedId] })
          void qc.invalidateQueries({ queryKey: ['session-messages', selectedId] })
        }
      }
    },
    [qc, selectedId],
  )

  useAdminStream(handleAdminEvent)

  return (
    <div className="flex h-screen bg-zinc-50">
      <Sidebar />
      <SessionList
        sessions={sessions}
        selectedId={selectedId}
        onSelect={setSelectedId}
        filter={filter}
        onFilter={setFilter}
      />
      {selectedSessionQ.data !== undefined ? (
        <ConversationView session={selectedSessionQ.data} currentAdminId={adminId} />
      ) : (
        <main className="flex flex-1 items-center justify-center text-zinc-400">
          {selectedId !== null ? 'Cargando…' : 'Seleccioná una sesión.'}
        </main>
      )}
      <ContextPanel session={selectedSessionQ.data ?? null} />
    </div>
  )
}
