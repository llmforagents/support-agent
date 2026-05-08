import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/infrastructure/apiClient'
import { useAuth } from '@/presentation/hooks/useAuth'
import { Button } from '@/presentation/components/ui/button'
import { cn } from '@/lib/cn'

interface SiteConfigResponse {
  readonly siteName?: string
  readonly onboardingCompleted?: boolean
  readonly adminOnline?: boolean
}

interface SessionSummary {
  readonly id: string
  readonly visitorId: string
  readonly status: string
  readonly lastMessage?: string
  readonly lastActivityAt: string
}

interface SessionsResponse {
  readonly sessions: readonly SessionSummary[]
}

export function Conversations(): React.JSX.Element {
  const { logout, auth } = useAuth()
  const adminEmail = auth.status === 'authenticated' ? auth.email : ''

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const cfg = useQuery({
    queryKey: ['config'],
    queryFn: () => apiClient.get<SiteConfigResponse>('/config'),
  })

  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiClient.get<SessionsResponse>('/conversations'),
    refetchInterval: 10_000,
  })

  const siteName = cfg.data?.siteName ?? '—'

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-900">{siteName}</span>
          <span className="text-xs text-gray-400">Support Dashboard</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">{adminEmail}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { void logout() }}
          >
            Sign out
          </Button>
        </div>
      </header>

      {/* 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: sessions list */}
        <aside className="flex w-64 flex-col border-r border-gray-200 bg-gray-50">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Conversations
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.isLoading && (
              <p className="px-4 py-3 text-xs text-gray-400">Loading…</p>
            )}
            {sessions.isError && (
              <p className="px-4 py-3 text-xs text-red-500">Failed to load sessions.</p>
            )}
            {sessions.data?.sessions.map((s) => (
              <button
                key={s.id}
                className={cn(
                  'w-full border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-white',
                  selectedId === s.id && 'bg-white font-medium',
                )}
                onClick={() => { setSelectedId(s.id) }}
              >
                <p className="truncate text-sm text-gray-800">{s.visitorId}</p>
                <p className="mt-0.5 truncate text-xs text-gray-400">
                  {s.lastMessage ?? 'No messages yet'}
                </p>
              </button>
            ))}
            {sessions.data?.sessions.length === 0 && (
              <p className="px-4 py-3 text-xs text-gray-400">No conversations yet.</p>
            )}
          </div>
        </aside>

        {/* Middle: conversation thread (P1 stub) */}
        <main className="flex flex-1 flex-col items-center justify-center bg-white">
          {selectedId === null ? (
            <p className="text-sm text-gray-400">Select a conversation to view messages.</p>
          ) : (
            <p className="text-sm text-gray-400">Thread for session {selectedId} (P1 stub)</p>
          )}
        </main>

        {/* Right: visitor meta (P1 stub) */}
        <aside className="w-64 border-l border-gray-200 bg-gray-50 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Visitor Info
          </h2>
          <p className="mt-3 text-xs text-gray-400">
            Select a conversation to see visitor details.
          </p>
        </aside>
      </div>
    </div>
  )
}
