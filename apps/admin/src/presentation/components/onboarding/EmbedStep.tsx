import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/presentation/components/ui/button'
import { t } from '@/lib/i18n'

interface EmbedStepProps {
  readonly embedSnippet: string | undefined
}

export function EmbedStep({ embedSnippet }: EmbedStepProps): React.JSX.Element {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  const snippet = embedSnippet ?? '<!-- embed snippet unavailable —>'

  async function copySnippet(): Promise<void> {
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => { setCopied(false) }, 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{t('embed.title')}</h2>
        <p className="mt-1 text-sm text-gray-700">
          {t('embed.description')}{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-900">&lt;/body&gt;</code> tag of your site.
        </p>
      </div>
      <div className="rounded-md border border-gray-300 bg-gray-50 p-4">
        {/* gray-900 on gray-50 = ~17:1 — passes AAA */}
        <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-gray-900">
          {snippet}
        </pre>
      </div>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => { void copySnippet() }}
      >
        {copied ? t('embed.copied') : t('embed.copy')}
      </Button>
      <Button
        className="w-full"
        onClick={() => { void navigate('/conversations') }}
      >
        {t('embed.goToDashboard')}
      </Button>
    </div>
  )
}
