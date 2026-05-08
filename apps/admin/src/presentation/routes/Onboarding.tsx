import { OnboardingWizard } from '@/presentation/components/onboarding/OnboardingWizard'

export function Onboarding(): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <OnboardingWizard />
    </div>
  )
}
