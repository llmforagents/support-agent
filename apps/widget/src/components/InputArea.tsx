import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { MAX_VISITOR_MESSAGE_LEN } from '../constants'
import { t } from '../lib/i18n'

export type InputAreaProps = Readonly<{
  disabled: boolean
  primaryColor: string
  onSend: (content: string) => void
}>

export function InputArea({ disabled, primaryColor, onSend }: InputAreaProps): JSX.Element {
  const [value, setValue] = useState('')

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit(): void {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  const remaining = MAX_VISITOR_MESSAGE_LEN - value.length
  const nearLimit = remaining < 100

  return (
    <div
      style={{
        borderTop: '1px solid #e5e7eb',
        padding: '12px',
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-end',
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, position: 'relative' }}>
        <textarea
          value={value}
          onInput={(e) => { setValue((e.target as HTMLTextAreaElement).value) }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={t('widget.placeholder')}
          maxLength={MAX_VISITOR_MESSAGE_LEN}
          rows={1}
          style={{
            width: '100%',
            resize: 'none',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            padding: '8px 10px',
            fontSize: '14px',
            fontFamily: 'inherit',
            outline: 'none',
            boxSizing: 'border-box',
            maxHeight: '120px',
            overflow: 'auto',
          }}
        />
        {nearLimit && (
          <div style={{ fontSize: '11px', color: remaining < 20 ? '#ef4444' : '#6b7280', textAlign: 'right' }}>
            {remaining}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={t('widget.send')}
        disabled={disabled || value.trim().length === 0}
        onClick={submit}
        style={{
          background: primaryColor,
          border: 'none',
          borderRadius: '8px',
          color: '#fff',
          cursor: disabled || value.trim().length === 0 ? 'not-allowed' : 'pointer',
          opacity: disabled || value.trim().length === 0 ? 0.5 : 1,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
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
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </button>
    </div>
  )
}
