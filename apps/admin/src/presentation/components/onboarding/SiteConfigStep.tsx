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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    onNext({ siteName, primaryColor })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{t('siteConfig.title')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('siteConfig.description')}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
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
              className="h-10 w-12 cursor-pointer rounded border border-gray-300 p-1"
            />
            <Input
              type="text"
              value={primaryColor}
              onChange={(e) => { setPrimaryColor(e.target.value) }}
              pattern="^#[0-9a-fA-F]{6}$"
              className="font-mono"
            />
          </div>
        </div>
        <Button type="submit" className="w-full">
          {t('siteConfig.submit')}
        </Button>
      </form>
    </div>
  )
}
