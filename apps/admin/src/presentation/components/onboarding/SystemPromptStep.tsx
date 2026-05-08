import React, { useState } from 'react'
import { Button } from '@/presentation/components/ui/button'
import { Label } from '@/presentation/components/ui/label'
import { apiClient, ApiError } from '@/infrastructure/apiClient'

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
        setError(`Failed to save configuration (${err.status.toString()}).`)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">System Prompt</h2>
        <p className="mt-1 text-sm text-gray-500">
          Define how your AI support agent should behave.
        </p>
      </div>
      <form
        onSubmit={(e) => { void handleSubmit(e) }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="sp-prompt">System prompt</Label>
          <textarea
            id="sp-prompt"
            required
            minLength={10}
            maxLength={8000}
            rows={8}
            value={systemPrompt}
            onChange={(e) => { setSystemPrompt(e.target.value) }}
            className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="text-xs text-gray-400">{systemPrompt.length}/8000 characters</p>
        </div>
        {error !== null && (
          <p role="alert" className="text-sm text-red-600">{error}</p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Saving…' : 'Save & continue'}
        </Button>
      </form>
    </div>
  )
}
