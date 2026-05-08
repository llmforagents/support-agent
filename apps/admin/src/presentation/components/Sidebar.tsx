import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'

type Item = { readonly to: string; readonly icon: string; readonly label: string }

const items: readonly Item[] = [
  { to: '/conversations', icon: '💬', label: 'Conversaciones' },
  { to: '/knowledge-base', icon: '📚', label: 'Knowledge base' },
]

export function Sidebar(): React.JSX.Element {
  const { pathname } = useLocation()
  return (
    <aside className="flex w-16 flex-col items-center gap-4 border-r border-zinc-200 bg-white py-4">
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          title={it.label}
          className={cn(
            'rounded-md p-2 transition-colors',
            pathname === it.to
              ? 'bg-indigo-50 text-indigo-600'
              : 'text-zinc-400 hover:bg-zinc-100',
          )}
        >
          {it.icon}
        </Link>
      ))}
    </aside>
  )
}
