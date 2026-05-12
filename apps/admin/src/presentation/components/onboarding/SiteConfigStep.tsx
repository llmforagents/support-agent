import React, { useState } from 'react'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'
import { t } from '@/lib/i18n'

interface SiteConfigData {
  readonly siteName: string
  readonly primaryColor: string
}

interface SiteConfigStepProps {
  readonly onNext: (data: SiteConfigData) => void
}

export function SiteConfigStep({ onNext }: SiteConfigStepProps): React.JSX.Element {
  const [siteName, setSiteName] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#2563eb')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    setError(null)
    const name = siteName.trim()
    if (name.length === 0) {
      setError('Enter a site name.')
      return
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
      setError('Primary color must be a 6-digit hex code (e.g. #4f46e5).')
      return
    }
    onNext({ siteName: name, primaryColor })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{t('siteConfig.title')}</h2>
        <p className="mt-1 text-sm text-gray-700">{t('siteConfig.description')}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="sc-name">{t('siteConfig.siteName')}</Label>
          <Input
            id="sc-name"
            type="text"
            required
            placeholder={t('siteConfig.siteNamePlaceholder')}
            value={siteName}
            onChange={(e) => { setSiteName(e.target.value) }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sc-color">{t('siteConfig.primaryColor')}</Label>
          <div className="flex items-center gap-3">
            <input
              id="sc-color"
              type="color"
              value={primaryColor}
              onChange={(e) => { setPrimaryColor(e.target.value) }}
              aria-label={t('siteConfig.primaryColor')}
              className="h-10 w-12 cursor-pointer rounded border border-gray-400 p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <Label htmlFor="sc-color-hex" className="sr-only">{t('siteConfig.primaryColor')}</Label>
            <Input
              id="sc-color-hex"
              type="text"
              value={primaryColor}
              onChange={(e) => { setPrimaryColor(e.target.value) }}
              pattern="^#[0-9a-fA-F]{6}$"
              className="font-mono"
            />
          </div>
        </div>
        {error !== null && (
          <p role="alert" className="text-sm text-red-600">{error}</p>
        )}
        <Button type="submit" className="w-full">
          {t('siteConfig.submit')}
        </Button>
      </form>
    </div>
  )
}
