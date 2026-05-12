import React from 'react'
import { Sidebar } from '@/presentation/components/Sidebar'
import { ChangePasswordForm } from '@/presentation/components/settings/ChangePasswordForm'

export function Settings(): React.JSX.Element {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <Sidebar />
      <main id="main-content" aria-labelledby="settings-heading" className="flex-1 p-8">
        <a href="#main-content" className="sr-only focus:not-sr-only">Skip to content</a>
        <h1 id="settings-heading" className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>
        <ChangePasswordForm />
      </main>
    </div>
  )
}
