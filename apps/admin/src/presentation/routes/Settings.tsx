import { Sidebar } from '@/presentation/components/Sidebar'
import { McpToggle } from '@/presentation/components/settings/McpToggle'
import { t } from '@/lib/i18n'

export function Settings(): React.JSX.Element {
  return (
    <div className="flex h-screen bg-zinc-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:text-blue-700 focus:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        {t('a11y.skipToContent')}
      </a>
      <Sidebar />
      <main
        id="main-content"
        aria-labelledby="settings-heading"
        className="flex-1 overflow-y-auto p-6"
      >
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 id="settings-heading" className="text-2xl font-bold text-zinc-900">
            {t('settings.title')}
          </h1>
          <McpToggle />
        </div>
      </main>
    </div>
  )
}
