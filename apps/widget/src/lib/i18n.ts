/**
 * i18n.ts — minimal translation boundary for the widget embed app.
 *
 * Default locale is English. Sites that want Spanish opt in by adding
 * `data-lang="es"` to the widget script tag — bootstrap.ts forwards the
 * choice to the iframe as `?lang=es` and we read it here.
 *
 * Auto-detection from `navigator.language` was removed deliberately: visitors
 * on Spanish-set browsers were seeing Spanish even on English-only sites,
 * mixing UI languages with the agent's own replies.
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

function resolveLocale(): string {
  if (typeof window === 'undefined') return 'en'
  try {
    const param = new URLSearchParams(window.location.search).get('lang')
    if (param && param in CATALOGS) return param
  } catch { /* ignore */ }
  return 'en'
}

const catalog: MessageCatalog = CATALOGS[resolveLocale()] ?? (en as MessageCatalog)

/**
 * Look up a message key.
 *
 * Falls back to English catalog if key is missing, then to the raw key string.
 */
export function t(key: MessageKey): string {
  return catalog[key] ?? (en as MessageCatalog)[key] ?? key
}
