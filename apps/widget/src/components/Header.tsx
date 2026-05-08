import type { JSX } from 'preact'
import { t } from '../lib/i18n'

export type HeaderProps = Readonly<{
  siteName: string
  primaryColor: string
  adminOnline: boolean
  onClose: () => void
}>

export function Header({ siteName, primaryColor, adminOnline, onClose }: HeaderProps): JSX.Element {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 600, fontSize: '15px' }}>{siteName}</span>
        <span
          title={adminOnline ? t('widget.statusOnline') : t('widget.statusOffline')}
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: adminOnline ? '#4ade80' : '#9ca3af',
            display: 'inline-block',
          }}
        />
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
