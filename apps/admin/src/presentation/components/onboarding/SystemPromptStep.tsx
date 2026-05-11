import React, { useState } from 'react'
import { Button } from '@/presentation/components/ui/button'
import { Label } from '@/presentation/components/ui/label'
import { apiClient, ApiError } from '@/infrastructure/apiClient'
import { t } from '@/lib/i18n'

interface SystemPromptStepProps {
  readonly onNext: (data: { systemPrompt: string; embedSnippet: string }) => void
  readonly siteData: Readonly<{
    siteName?: string
    primaryColor?: string
    llm4agentsApiKey?: string
    agentModel?: string
  }>
}

const DEFAULT_PROMPT = `You are a helpful customer support assistant. Be concise, friendly, and accurate.

If you cannot answer a question or the user needs human assistance, use the handoff tool.`

export function SystemPromptStep({ onNext, siteData }: SystemPromptStepProps): React.JSX.Element {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload = {
        siteName: siteData.siteName ?? '',
        primaryColor: siteData.primaryColor ?? '#2563eb',
        llm4agentsApiKey: siteData.llm4agentsApiKey ?? '',
        agentModel: siteData.agentModel ?? '',
        systemPrompt,
      }
      const result = await apiClient.post<{ siteKey: string; embedSnippet: string }>(
        '/onboarding/complete',
        payload,
      )
      onNext({ systemPrompt, embedSnippet: result.embedSnippet })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${t('systemPrompt.error.generic')} (${err.status.toString()})`)
      } else {
        setError(t('systemPrompt.error.generic'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{t('systemPrompt.title')}</h2>
        <p className="mt-1 text-sm text-gray-700">{t('systemPrompt.description')}</p>
      </div>
      <form
        onSubmit={(e) => { void handleSubmit(e) }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="sp-prompt">{t('systemPrompt.label')}</Label>
          <textarea
            id="sp-prompt"
            required
            minLength={10}
            maxLength={8000}
            rows={8}
            value={systemPrompt}
            onChange={(e) => { setSystemPrompt(e.target.value) }}
            aria-describedby="sp-counter"
            className="flex w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p id="sp-counter" role="status" aria-live="polite" className="text-xs text-gray-700">
            {systemPrompt.length}/8000 {t('systemPrompt.charCount')}
          </p>
        </div>
        {error !== null && (
          <p role="alert" className="text-sm text-red-600">{error}</p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t('systemPrompt.submitting') : t('systemPrompt.submit')}
        </Button>
      </form>
    </div>
  )
}
