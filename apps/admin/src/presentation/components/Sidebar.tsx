import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import { OnlineToggle } from '@/presentation/components/admin/OnlineToggle'

type Item = { readonly to: string; readonly icon: string; readonly labelKey: 'sidebar.conversations' | 'sidebar.knowledgeBase' }

const items: readonly Item[] = [
  { to: '/conversations', icon: '💬', labelKey: 'sidebar.conversations' },
  { to: '/knowledge-base', icon: '📚', labelKey: 'sidebar.knowledgeBase' },
]

export function Sidebar(): React.JSX.Element {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label={t('a11y.primaryNav')}
      className="flex w-16 flex-col items-center gap-4 border-r border-zinc-200 bg-white py-4"
    >
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
              // Focus ring — passes AA for UI components (blue-600 = 4.6:1)
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
              active
                // indigo-600 on indigo-50 stays high-contrast for the active state
                ? 'bg-indigo-50 text-indigo-700'
                // zinc-600 (#52525b) = 7.1:1 on white — passes AA. zinc-400 (3.3:1) was failing.
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
            )}
          >
            <span aria-hidden="true">{it.icon}</span>
          </Link>
        )
      })}
    </nav>
  )
}
