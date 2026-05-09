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
  active_ai: 'bg-zinc-100 text-zinc-700',
  handoff_requested: 'bg-yellow-100 text-yellow-900',
  active_operator: 'bg-indigo-100 text-indigo-900',
  released_to_ai: 'bg-blue-50 text-blue-700',
  closed: 'bg-zinc-50 text-zinc-500',
}

const FILTER_OPTIONS: readonly StatusFilter[] = ['all', 'handoff_requested', 'active_operator', 'active_ai']

function filterLabel(f: StatusFilter): string {
  if (f === 'all') return 'Todas'
  return STATUS_LABELS[f] ?? f
}

export function SessionList({ sessions, selectedId, onSelect, filter, onFilter }: Props): React.JSX.Element {
  const filtered = filter === 'all' ? sessions : sessions.filter((s) => s.state.status === filter)

  return (
    <section className="flex w-72 flex-col border-r border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3">
        <div className="font-semibold">Conversaciones</div>
        <div className="text-xs text-zinc-500">
          {sessions.length} total · {filtered.length} visibles
        </div>
      </div>
      <div className="flex gap-1 border-b border-zinc-200 px-2 py-1 text-xs">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => { onFilter(f) }}
            className={cn(
              'rounded px-2 py-1',
              filter === f
                ? 'bg-indigo-50 text-indigo-700 font-semibold'
                : 'text-zinc-600 hover:bg-zinc-100',
            )}
          >
            {filterLabel(f)}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">Sin sesiones.</div>
        ) : (
          filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onSelect(s.id) }}
              className={cn(
                'flex w-full items-start justify-between gap-2 border-b border-zinc-100 px-4 py-3 text-left',
                selectedId === s.id ? 'bg-indigo-50' : 'hover:bg-zinc-50',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">Visitor {s.id.slice(0, 8)}</div>
                <div className="truncate text-xs text-zinc-500">{s.visitorMeta.url ?? '—'}</div>
              </div>
              <span
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium',
                  STATUS_BADGES[s.state.status] ?? 'bg-zinc-100',
                )}
              >
                {STATUS_LABELS[s.state.status] ?? s.state.status}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  )
}
