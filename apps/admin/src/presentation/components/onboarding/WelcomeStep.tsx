import { Button } from '@/presentation/components/ui/button'

interface WelcomeStepProps {
  readonly onNext: () => void
}

export function WelcomeStep({ onNext }: WelcomeStepProps): React.JSX.Element {
  return (
    <div className="space-y-6 text-center">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Welcome to LLM4Agents Support</h2>
        <p className="mt-2 text-gray-500">
          Let&apos;s get your AI-powered support widget up and running in just a few steps.
        </p>
      </div>
      <ul className="space-y-2 text-left text-sm text-gray-600">
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">1</span>
          Create your admin account
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">2</span>
          Configure your site details
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">3</span>
          Connect your AI agent
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">4</span>
          Customise the system prompt
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">5</span>
          Embed the widget on your site
        </li>
      </ul>
      <Button onClick={onNext} className="w-full">
        Get started
      </Button>
    </div>
  )
}
