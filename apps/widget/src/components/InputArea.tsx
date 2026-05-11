import type { JSX } from 'preact'
import { useState, useId } from 'preact/hooks'
import { MAX_VISITOR_MESSAGE_LEN } from '../constants'
import { t } from '../lib/i18n'

export type InputAreaProps = Readonly<{
  /** Optional id propagated from a parent that wants to control the label-input pairing */
  inputId?: string
  disabled: boolean
  primaryColor: string
  onSend: (content: string) => void
}>

export function InputArea({ inputId: inputIdProp, disabled, primaryColor, onSend }: InputAreaProps): JSX.Element {
  const generatedId = useId()
  const inputId = inputIdProp ?? generatedId
  const counterId = `${inputId}-counter`
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
  const canSubmit = !disabled && value.trim().length > 0

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
        <label htmlFor={inputId} className="sr-only">
          {t('widget.inputLabel')}
        </label>
        <textarea
          id={inputId}
          value={value}
          onInput={(e) => { setValue((e.target as HTMLTextAreaElement).value) }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={t('widget.placeholder')}
          maxLength={MAX_VISITOR_MESSAGE_LEN}
          aria-describedby={nearLimit ? counterId : undefined}
          rows={1}
          style={{
            width: '100%',
            resize: 'none',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            padding: '8px 10px',
            fontSize: '14px',
            fontFamily: 'inherit',
            // Native outline is disabled, focus ring is supplied by embed.html :focus-visible
            outline: 'none',
            boxSizing: 'border-box',
            maxHeight: '120px',
            overflow: 'auto',
            // #1f2937 = 12.6:1 on white — passes AA
            color: '#1f2937',
          }}
        />
        {nearLimit && (
          <div
            id={counterId}
            role="status"
            aria-live="polite"
            style={{
              fontSize: '11px',
              // remaining<20 → #b91c1c (red-700, 6.4:1); else #4b5563 (7.6:1). Both AA.
              color: remaining < 20 ? '#b91c1c' : '#4b5563',
              textAlign: 'right',
            }}
          >
            {remaining}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={t('widget.send')}
        disabled={!canSubmit}
        onClick={submit}
        style={{
          background: primaryColor,
          border: 'none',
          borderRadius: '8px',
          color: '#fff',
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          opacity: canSubmit ? 1 : 0.5,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
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
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </button>
    </div>
  )
}
