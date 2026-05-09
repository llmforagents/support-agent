import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, type Message } from '@/infrastructure/apiClient'
import { Button } from '@/presentation/components/ui/button'
import { OperatorComposer } from './OperatorComposer'
import { cn } from '@/lib/cn'

type SessionView = {
  readonly id: string
  readonly state: { readonly status: string; readonly operatorId?: string; readonly [k: string]: unknown }
}

type Props = {
  readonly session: SessionView
  readonly currentAdminId: string | null
}

export function ConversationView({ session, currentAdminId }: Props): React.JSX.Element {
  const qc = useQueryClient()

  const messagesQ = useQuery({
    queryKey: ['session-messages', session.id],
    queryFn: () => apiClient.sessionMessages(session.id, { limit: 100 }),
    refetchInterval: 3_000,
  })

  const claim = useMutation({
    mutationFn: () => apiClient.sessionClaim(session.id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['sessions'] }) },
  })
  const release = useMutation({
    mutationFn: () => apiClient.sessionRelease(session.id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['sessions'] }) },
  })
  const close = useMutation({
    mutationFn: () => apiClient.sessionClose(session.id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['sessions'] }) },
  })
  const send = useMutation({
    mutationFn: (content: string) => apiClient.sessionSendOperatorMessage(session.id, content),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['session-messages', session.id] }) },
  })

  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [messagesQ.data?.messages.length])

  const status = session.state.status
  const isMine =
    status === 'active_operator' &&
    currentAdminId !== null &&
    session.state['operatorId'] === currentAdminId
  const canClaim = status === 'handoff_requested'
  const canRelease = isMine
  const canClose = status !== 'closed'
  const composerDisabled = !isMine

  return (
    <main className="flex flex-1 flex-col bg-zinc-50">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <div>
          <div className="font-semibold">Visitor {session.id.slice(0, 8)}</div>
          <div className="text-xs text-zinc-500">Status: {status}</div>
        </div>
        <div className="flex gap-2">
          {canClaim && (
            <Button size="sm" onClick={() => { claim.mutate() }} disabled={claim.isPending}>
              Reclamar
            </Button>
          )}
          {canRelease && (
            <Button size="sm" variant="outline" onClick={() => { release.mutate() }} disabled={release.isPending}>
              Liberar
            </Button>
          )}
          {canClose && (
            <Button size="sm" variant="ghost" onClick={() => { close.mutate() }} disabled={close.isPending}>
              Cerrar
            </Button>
          )}
        </div>
      </div>

      <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messagesQ.data?.messages.map((m: Message) => {
          if (m.role === 'system_event') {
            return (
              <div key={m.id} className="text-center text-xs italic text-zinc-500">
                {m.content}
              </div>
            )
          }
          const isVisitor = m.role === 'visitor'
          return (
            <div key={m.id} className={cn('flex', isVisitor ? 'justify-start' : 'justify-end')}>
              <div
                className={cn(
                  'max-w-[70%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                  m.role === 'operator'
                    ? 'bg-indigo-600 text-white'
                    : m.role === 'assistant'
                      ? 'border border-zinc-200 bg-white'
                      : 'bg-zinc-200',
                )}
              >
                {m.role === 'operator' && (
                  <div className="mb-0.5 text-xs opacity-75">Operador</div>
                )}
                {m.role === 'assistant' && (
                  <div className="mb-0.5 text-xs text-zinc-500">AI</div>
                )}
                {m.content}
              </div>
            </div>
          )
        })}
      </div>

      <OperatorComposer
        disabled={composerDisabled}
        onSend={async (content) => { await send.mutateAsync(content) }}
      />
    </main>
  )
}
