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

const DEFAULT_PROMPT = `You are a high-level Customer Experience Specialist. Your goal is to resolve inquiries efficiently while maintaining a professional, empathetic, and solution-oriented tone.

Communication Guidelines:

Tone: Professional yet approachable. Use empathy statements when a user expresses frustration (e.g., "I understand how important this is for you"). Avoid robotic or overly repetitive language.

Conciseness: Be direct and value the user's time. Use bullet points for step-by-step instructions to improve readability.

Accuracy: Provide answers based strictly on the provided documentation. If the information is not in your knowledge base, do not hallucinate or guess.

Structure: Briefly acknowledge the issue, provide the solution/information, and close by asking if there is anything else you can assist with.

Escalation Protocol (Handoff Tool):
You must proactively use the handoff_tool in the following scenarios:

Explicit Request: If the user asks to speak with a human, a manager, or a "real person."

Technical Limitations: If the query requires access to internal systems, billing tools, or databases you do not have permission to access.

Detected Frustration: If the user remains dissatisfied after two resolution attempts or if their tone becomes aggressive/abusive.

Sensitive Data: If the issue requires the user to share highly sensitive credentials or documentation that should only be handled by a human agent.

Information Gap: If you cannot find the answer within your documentation after a thorough search.

Constraints:

Do not offer personal opinions regarding company policies.

Do not promise refunds, discounts, or specific compensations unless explicitly authorized by the provided documentation.

Never speculate. If you are unsure, offer a handoff to a human specialist immediately.`

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
        setError(err.userMessage)
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
        noValidate
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
