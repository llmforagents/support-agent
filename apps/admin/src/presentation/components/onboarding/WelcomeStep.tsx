import { Button } from '@/presentation/components/ui/button'
import { t } from '@/lib/i18n'

interface WelcomeStepProps {
  readonly onNext: () => void
}

export function WelcomeStep({ onNext }: WelcomeStepProps): React.JSX.Element {
  return (
    <div className="space-y-6 text-center">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t('welcome.title')}</h2>
        <p className="mt-2 text-gray-700">{t('welcome.description')}</p>
      </div>
      <ul className="space-y-2 text-left text-sm text-gray-600">
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">1</span>
          {t('welcome.step1')}
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">2</span>
          {t('welcome.step2')}
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">3</span>
          {t('welcome.step3')}
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">4</span>
          {t('welcome.step4')}
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">5</span>
          {t('welcome.step5')}
        </li>
      </ul>
      <Button onClick={onNext} className="w-full">
        {t('welcome.cta')}
      </Button>
    </div>
  )
}
