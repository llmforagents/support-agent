import { Sidebar } from '@/presentation/components/Sidebar'
import { McpToggle } from '@/presentation/components/settings/McpToggle'
import { t } from '@/lib/i18n'

export function Settings(): React.JSX.Element {
  return (
    <div className="flex h-screen bg-zinc-50">
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
