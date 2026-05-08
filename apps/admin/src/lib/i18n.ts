/**
 * i18n.ts — minimal translation boundary for the admin app.
 *
 * Reads the browser locale (or falls back to 'en') and returns a `t` function
 * that looks up keys in the matching message catalog. No external dependencies.
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

function detectLocale(): string {
  const raw = navigator.language ?? 'en'
  // Match on the primary language tag only (e.g. 'es-AR' → 'es')
  const primary = raw.split('-')[0]?.toLowerCase() ?? 'en'
  return primary in CATALOGS ? primary : 'en'
}

const catalog: MessageCatalog = CATALOGS[detectLocale()] ?? (en as MessageCatalog)

/**
 * Look up a message key.
 *
 * Falls back to the English catalog if the key is missing in the detected locale,
 * and finally returns the raw key string so a missing translation is always visible.
 */
export function t(key: MessageKey): string {
  return catalog[key] ?? (en as MessageCatalog)[key] ?? key
}
