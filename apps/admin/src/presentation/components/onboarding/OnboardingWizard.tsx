import { useState } from 'react'
import { Card, CardContent } from '@/presentation/components/ui/card'
import { WelcomeStep } from './WelcomeStep'
import { CreateAdminStep } from './CreateAdminStep'
import { SiteConfigStep } from './SiteConfigStep'
import { ConnectAgentStep } from './ConnectAgentStep'
import { SystemPromptStep } from './SystemPromptStep'
import { EmbedStep } from './EmbedStep'

type Step = 0 | 1 | 2 | 3 | 4 | 5

interface WizardData {
  siteName?: string
  primaryColor?: string
  llm4agentsApiKey?: string
  agentModel?: string
  systemPrompt?: string
  embedSnippet?: string
}

const STEP_LABELS: Record<Step, string> = {
  0: 'Welcome',
  1: 'Admin Account',
  2: 'Site Config',
  3: 'Connect Agent',
  4: 'System Prompt',
  5: 'Embed',
}

export function OnboardingWizard(): React.JSX.Element {
  const [step, setStep] = useState<Step>(0)
  const [data, setData] = useState<WizardData>({})

  function advance(): void {
    setStep((s) => Math.min(s + 1, 5) as Step)
  }

  const totalSteps = 6

  return (
    <div className="w-full max-w-lg">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-400">
          <span>{STEP_LABELS[step]}</span>
          <span>Step {step + 1} of {totalSteps}</span>
        </div>
        <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
          <div
            className="h-1.5 rounded-full bg-blue-600 transition-all"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {step === 0 && <WelcomeStep onNext={advance} />}
          {step === 1 && <CreateAdminStep onNext={advance} />}
          {step === 2 && (
            <SiteConfigStep
              onNext={(d) => {
                setData((prev) => ({ ...prev, ...d }))
                advance()
              }}
            />
          )}
          {step === 3 && (
            <ConnectAgentStep
              onNext={(d) => {
                setData((prev) => ({ ...prev, ...d }))
                advance()
              }}
            />
          )}
          {step === 4 && (
            <SystemPromptStep
              onNext={(d) => {
                setData((prev) => ({ ...prev, ...d }))
                advance()
              }}
              siteData={data}
            />
          )}
          {step === 5 && <EmbedStep embedSnippet={data.embedSnippet} />}
        </CardContent>
      </Card>
    </div>
  )
}
