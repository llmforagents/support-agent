/**
 * i18n.ts — minimal translation boundary for the admin app.
 *
 * Default locale is English. Spanish is available as an opt-in via:
 *   1. URL query param:  ?lang=es     (persists to localStorage)
 *   2. localStorage:     localStorage.setItem('admin_lang', 'es')
 *
 * Browser locale is NOT auto-detected — admin users are typically operators
 * who want a consistent UI regardless of which machine they're on.
 *
 * Usage:
 *   import { t } from '@/lib/i18n'
 *   <h1>{t('login.title')}</h1>
 */

import en from './messages.en'
import es from './messages.es'

type EnCatalog = typeof en
type MessageKey = keyof EnCatalog
// Each locale catalog has the same keys but different literal string values.
// We use Record<MessageKey, string> as the widened type for runtime lookup.
type MessageCatalog = Readonly<Record<MessageKey, string>>

const CATALOGS: Readonly<Record<string, MessageCatalog>> = {
  en: en as MessageCatalog,
  es: es as MessageCatalog,
}

const STORAGE_KEY = 'admin_lang'

function resolveLocale(): string {
  if (typeof window === 'undefined') return 'en'
  // 1. URL param wins (and persists)
  try {
    const param = new URLSearchParams(window.location.search).get('lang')
    if (param && param in CATALOGS) {
      window.localStorage.setItem(STORAGE_KEY, param)
      return param
    }
  } catch { /* SSR / no DOM — ignore */ }
  // 2. localStorage
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved && saved in CATALOGS) return saved
  } catch { /* storage disabled — ignore */ }
  // 3. Default
  return 'en'
}

const catalog: MessageCatalog = CATALOGS[resolveLocale()] ?? (en as MessageCatalog)

/**
 * Look up a message key.
 *
 * Falls back to the English catalog if the key is missing in the detected locale,
 * and finally returns the raw key string so a missing translation is always visible.
 */
export function t(key: MessageKey): string {
  return catalog[key] ?? (en as MessageCatalog)[key] ?? key
}
