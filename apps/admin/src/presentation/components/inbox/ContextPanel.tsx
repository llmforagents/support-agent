type SessionContext = {
  readonly id: string
  readonly visitorId: string
  readonly totalCostCents: number
  readonly visitorMeta: { readonly url?: string; readonly userAgent?: string; readonly language?: string }
  readonly state: { readonly status: string; readonly [k: string]: unknown }
}

type Props = {
  readonly session: SessionContext | null
}

export function ContextPanel({ session }: Props): React.JSX.Element {
  if (session === null) {
    return (
      <aside
        aria-label="Detalles del visitante"
        // zinc-600 = 7.1:1 on white — passes AA. zinc-500 borderline (4.6:1).
        className="hidden w-60 border-l border-zinc-200 bg-white p-4 text-sm text-zinc-600 lg:block"
      >
        Seleccioná una sesión.
      </aside>
    )
  }

  return (
    <aside
      aria-label="Detalles del visitante"
      className="hidden w-60 flex-shrink-0 border-l border-zinc-200 bg-white p-4 lg:block"
    >
      {/* zinc-700 = 9.4:1 on white. labels in zinc-600 = 7.1:1. */}
      <h2 className="mb-2 text-xs font-semibold uppercase text-zinc-700">Visitante</h2>
      <div className="break-words text-xs text-zinc-800">{session.visitorId.slice(0, 8)}</div>
      <div className="mb-3 text-xs text-zinc-600">{session.visitorMeta.language ?? '—'}</div>
      {session.visitorMeta.url !== undefined && (
        <div className="mb-3 text-xs">
          <div className="mb-1 text-zinc-600">URL</div>
          <div className="break-words text-zinc-800">{session.visitorMeta.url}</div>
        </div>
      )}
      <div className="mb-3 text-xs">
        <div className="mb-1 text-zinc-600">Costo</div>
        <div className="text-zinc-800">${(session.totalCostCents / 100).toFixed(2)}</div>
      </div>
    </aside>
  )
}
