import { cn } from '@/lib/cn'

type SessionItem = {
  readonly id: string
  readonly state: { readonly status: string }
  readonly lastActivityAt: string
  readonly visitorMeta: { readonly url?: string }
}

type StatusFilter = 'all' | 'handoff_requested' | 'active_operator' | 'active_ai'

type Props = {
  readonly sessions: readonly SessionItem[]
  readonly selectedId: string | null
  readonly onSelect: (id: string) => void
  readonly filter: StatusFilter
  readonly onFilter: (f: StatusFilter) => void
}

const STATUS_LABELS: Record<string, string> = {
  active_ai: 'AI',
  handoff_requested: 'Handoff',
  active_operator: 'Live',
  released_to_ai: 'Released',
  closed: 'Closed',
}

const STATUS_BADGES: Record<string, string> = {
  active_ai: 'bg-zinc-200 text-zinc-800',
  handoff_requested: 'bg-yellow-200 text-yellow-900',
  active_operator: 'bg-indigo-200 text-indigo-900',
  released_to_ai: 'bg-blue-200 text-blue-900',
  closed: 'bg-zinc-100 text-zinc-700',
}

const FILTER_OPTIONS: readonly StatusFilter[] = ['all', 'handoff_requested', 'active_operator', 'active_ai']

function filterLabel(f: StatusFilter): string {
  if (f === 'all') return 'All'
  return STATUS_LABELS[f] ?? f
}

export function SessionList({ sessions, selectedId, onSelect, filter, onFilter }: Props): React.JSX.Element {
  const filtered = filter === 'all' ? sessions : sessions.filter((s) => s.state.status === filter)

  return (
    <section
      aria-label="Conversation list"
      className="flex w-72 flex-col border-r border-zinc-200 bg-white"
    >
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="font-semibold text-zinc-900">Conversations</h2>
        {/* zinc-600 = 7.1:1 on white (AA pass). zinc-500 fails. */}
        <div className="text-xs text-zinc-600">
          {sessions.length} total · {filtered.length} visible
        </div>
      </div>
      <div
        role="group"
        aria-label="Conversation filters"
        className="flex gap-1 border-b border-zinc-200 px-2 py-1 text-xs"
      >
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => { onFilter(f) }}
            aria-pressed={filter === f}
            className={cn(
              'rounded px-2 py-1 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1',
              filter === f
                ? 'bg-indigo-100 text-indigo-800 font-semibold'
                : 'text-zinc-700 hover:bg-zinc-100',
            )}
          >
            {filterLabel(f)}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-600">No sessions.</p>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((s) => (
              <li key={s.id} className="border-b border-zinc-100">
                <button
                  type="button"
                  onClick={() => { onSelect(s.id) }}
                  aria-current={selectedId === s.id ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-start justify-between gap-2 px-4 py-3 text-left',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-inset',
                    selectedId === s.id ? 'bg-indigo-50' : 'hover:bg-zinc-50',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-900">
                      Visitor {s.id.slice(0, 8)}
                    </div>
                    <div className="truncate text-xs text-zinc-600">
                      {s.visitorMeta.url ?? '—'}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'rounded px-2 py-0.5 text-xs font-medium',
                      STATUS_BADGES[s.state.status] ?? 'bg-zinc-100 text-zinc-800',
                    )}
                  >
                    {STATUS_LABELS[s.state.status] ?? s.state.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
