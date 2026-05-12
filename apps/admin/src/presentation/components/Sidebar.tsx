import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import { OnlineToggle } from '@/presentation/components/admin/OnlineToggle'
import { useAuth } from '@/presentation/hooks/useAuth'

type Item = { readonly to: string; readonly icon: string; readonly labelKey: 'sidebar.conversations' | 'sidebar.knowledgeBase' | 'sidebar.settings' }

const items: readonly Item[] = [
  { to: '/conversations', icon: '💬', labelKey: 'sidebar.conversations' },
  { to: '/knowledge-base', icon: '📚', labelKey: 'sidebar.knowledgeBase' },
  { to: '/settings', icon: '⚙️', labelKey: 'sidebar.settings' },
]

export function Sidebar(): React.JSX.Element {
  const { pathname } = useLocation()
  const { logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout(): Promise<void> {
    await logout()
    void navigate('/login', { replace: true })
  }

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
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
              active
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
            )}
          >
            <span aria-hidden="true">{it.icon}</span>
          </Link>
        )
      })}
      {/* Logout pushed to the bottom of the rail */}
      <div className="mt-auto">
        <button
          type="button"
          onClick={() => { void handleLogout() }}
          title={t('sidebar.logout')}
          aria-label={t('sidebar.logout')}
          className={cn(
            'rounded-md p-2 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
            'text-zinc-600 hover:bg-red-50 hover:text-red-700',
          )}
        >
          <span aria-hidden="true">🚪</span>
        </button>
      </div>
    </nav>
  )
}
