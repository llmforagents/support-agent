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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    onNext({ llm4agentsApiKey: apiKey, agentModel: model })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{t('connectAgent.title')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('connectAgent.description')}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ca-api-key">{t('connectAgent.apiKey')}</Label>
          <Input
            id="ca-api-key"
            type="password"
            required
            placeholder={t('connectAgent.apiKeyPlaceholder')}
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value) }}
          />
          <p className="text-xs text-gray-400">
            {t('connectAgent.apiKeyHint')}{' '}
            <a
              href="https://llm4agents.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
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
        <Button type="submit" className="w-full">
          {t('connectAgent.submit')}
        </Button>
      </form>
    </div>
  )
}
