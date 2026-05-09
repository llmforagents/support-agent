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
      <aside className="hidden w-60 border-l border-zinc-200 bg-white p-4 text-sm text-zinc-500 lg:block">
        Seleccioná una sesión.
      </aside>
    )
  }

  return (
    <aside className="hidden w-60 flex-shrink-0 border-l border-zinc-200 bg-white p-4 lg:block">
      <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Visitante</h3>
      <div className="break-words text-xs text-zinc-700">{session.visitorId.slice(0, 8)}</div>
      <div className="mb-3 text-xs text-zinc-500">{session.visitorMeta.language ?? '—'}</div>
      {session.visitorMeta.url !== undefined && (
        <div className="mb-3 text-xs">
          <div className="mb-1 text-zinc-500">URL</div>
          <div className="break-words">{session.visitorMeta.url}</div>
        </div>
      )}
      <div className="mb-3 text-xs">
        <div className="mb-1 text-zinc-500">Costo</div>
        <div>${(session.totalCostCents / 100).toFixed(2)}</div>
      </div>
    </aside>
  )
}
