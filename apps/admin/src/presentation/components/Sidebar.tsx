import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import { OnlineToggle } from '@/presentation/components/admin/OnlineToggle'

type Item = { readonly to: string; readonly icon: string; readonly labelKey: 'sidebar.conversations' | 'sidebar.knowledgeBase' | 'sidebar.settings' }

const items: readonly Item[] = [
  { to: '/conversations', icon: '💬', labelKey: 'sidebar.conversations' },
  { to: '/knowledge-base', icon: '📚', labelKey: 'sidebar.knowledgeBase' },
  { to: '/settings', icon: '⚙️', labelKey: 'sidebar.settings' },
]

export function Sidebar(): React.JSX.Element {
  const { pathname } = useLocation()
  return (
    <aside className="flex w-16 flex-col items-center gap-4 border-r border-zinc-200 bg-white py-4">
      <OnlineToggle />
      {items.map((it) => {
        const label = t(it.labelKey)
        const active = pathname === it.to
        return (
          <Link
            key={it.to}
            to={it.to}
            title={label}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md p-2 transition-colors',
              active
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-zinc-400 hover:bg-zinc-100',
            )}
          >
            <span aria-hidden="true">{it.icon}</span>
          </Link>
        )
      })}
    </aside>
  )
}
