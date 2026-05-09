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
    statusColor = '#f59e0b'
  } else if (conversationStatus === 'active_operator') {
    statusLabel = t('widget.statusOperator')
    statusColor = '#22c55e'
  } else if (adminOnline) {
    statusLabel = t('widget.statusOnline')
    statusColor = 'rgba(255,255,255,0.85)'
  } else {
    statusLabel = t('widget.statusOffline')
    statusColor = 'rgba(255,255,255,0.6)'
  }

  return (
    <div
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
