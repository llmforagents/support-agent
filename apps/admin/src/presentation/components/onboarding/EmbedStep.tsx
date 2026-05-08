import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/presentation/components/ui/button'

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
        <h2 className="text-xl font-bold text-gray-900">Embed the Widget</h2>
        <p className="mt-1 text-sm text-gray-500">
          Copy the snippet below and paste it before the closing{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">&lt;/body&gt;</code> tag of your site.
        </p>
      </div>
      <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
        <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-gray-700">
          {snippet}
        </pre>
      </div>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => { void copySnippet() }}
      >
        {copied ? 'Copied!' : 'Copy snippet'}
      </Button>
      <Button
        className="w-full"
        onClick={() => { void navigate('/conversations') }}
      >
        Go to dashboard
      </Button>
    </div>
  )
}
