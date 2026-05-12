import React, { useState } from 'react'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'
import { t } from '@/lib/i18n'

interface ConnectAgentData {
  readonly llm4agentsApiKey: string
  readonly agentModel: string
}

interface ConnectAgentStepProps {
  readonly onNext: (data: ConnectAgentData) => void
}

export function ConnectAgentStep({ onNext }: ConnectAgentStepProps): React.JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('openai/gpt-4o-mini')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    setError(null)
    if (apiKey.trim().length < 20) {
      setError('API key looks too short. Paste your llm4agents agent key (typically 64 characters).')
      return
    }
    if (model.trim().length === 0) {
      setError('Pick a model (e.g. openai/gpt-4o-mini).')
      return
    }
    onNext({ llm4agentsApiKey: apiKey, agentModel: model.trim() })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{t('connectAgent.title')}</h2>
        <p className="mt-1 text-sm text-gray-700">{t('connectAgent.description')}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="ca-api-key">{t('connectAgent.apiKey')}</Label>
          <Input
            id="ca-api-key"
            type="password"
            autoComplete="off"
            required
            placeholder={t('connectAgent.apiKeyPlaceholder')}
            aria-describedby="ca-api-key-hint"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value) }}
          />
          {/* gray-700 = 8:1 on white — passes AA. gray-400 was failing. */}
          <p id="ca-api-key-hint" className="text-xs text-gray-700">
            {t('connectAgent.apiKeyHint')}{' '}
            <a
              href="https://llm4agents.com"
              target="_blank"
              rel="noopener noreferrer"
              // blue-700 = 5.9:1 on white — comfortable AA for link text
              className="text-blue-700 underline hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
            >
              llm4agents.com
            </a>
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ca-model">{t('connectAgent.model')}</Label>
          <Input
            id="ca-model"
            type="text"
            required
            value={model}
            onChange={(e) => { setModel(e.target.value) }}
          />
        </div>
        {error !== null && (
          <p role="alert" className="text-sm text-red-600">{error}</p>
        )}
        <Button type="submit" className="w-full">
          {t('connectAgent.submit')}
        </Button>
      </form>
    </div>
  )
}
