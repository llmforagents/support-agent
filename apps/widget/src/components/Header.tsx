import type { JSX } from 'preact'
import { t } from '../lib/i18n'

export type HeaderProps = Readonly<{
  siteName: string
  primaryColor: string
  adminOnline: boolean
  /** Conversation-level status overrides the admin online indicator when set */
  conversationStatus?: string
  onClose: () => void
}>

export function Header({ siteName, primaryColor, adminOnline, conversationStatus, onClose }: HeaderProps): JSX.Element {
  let statusLabel: string
  let statusColor: string

  if (conversationStatus === 'handoff_requested') {
    statusLabel = t('widget.statusHandoff')
    // #fbbf24 = AA on indigo backgrounds; use solid amber-300 for adequate contrast on the colored header
    statusColor = '#fcd34d'
  } else if (conversationStatus === 'active_operator') {
    statusLabel = t('widget.statusOperator')
    // Tailwind green-300 — good contrast on indigo header
    statusColor = '#86efac'
  } else if (adminOnline) {
    statusLabel = t('widget.statusOnline')
    // Bumped from rgba(255,255,255,0.85) → solid white-on-primary fragment
    statusColor = 'rgba(255,255,255,0.95)'
  } else {
    statusLabel = t('widget.statusOffline')
    // Bumped from rgba(255,255,255,0.6) → rgba 0.85 for AA on primary
    statusColor = 'rgba(255,255,255,0.85)'
  }

  return (
    <div
      className="w-on-primary"
      style={{
        background: primaryColor,
        color: '#fff',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: '16px 16px 0 0',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontWeight: 600, fontSize: '15px' }}>{siteName}</span>
        <span
          role="status"
          aria-live="polite"
          style={{
            fontSize: '11px',
            color: statusColor,
            lineHeight: 1.2,
          }}
        >
          {statusLabel}
        </span>
      </div>
      <button
        type="button"
        aria-label={t('widget.close')}
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
