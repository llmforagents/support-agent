import type { JSX } from 'preact'
import type { ChatMessage } from '../types'
import { t } from '../lib/i18n'

export type MessageBubbleProps = Readonly<{
  message: ChatMessage
  primaryColor: string
}>

export function MessageBubble({ message, primaryColor }: MessageBubbleProps): JSX.Element {
  const isVisitor = message.role === 'visitor'
  const isOperator = message.role === 'operator'
  const isSystem = message.role === 'system_event'

  if (isSystem) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          textAlign: 'center',
          fontSize: '12px',
          // #4b5563 = 7.6:1 on white — passes AA. #6b7280 = 4.8:1 (borderline)
          color: '#4b5563',
          padding: '4px 8px',
          fontStyle: 'italic',
        }}
      >
        {message.content}
      </div>
    )
  }

  const articleLabel = isVisitor
    ? t('widget.yourMessage')
    : isOperator
      ? t('widget.operatorMessage')
      : t('widget.agentMessage')

  return (
    <div
      role="article"
      aria-label={articleLabel}
      style={{
        display: 'flex',
        justifyContent: isVisitor ? 'flex-end' : 'flex-start',
        marginBottom: '8px',
      }}
    >
      <div
        style={{
          maxWidth: '80%',
          padding: '8px 12px',
          borderRadius: isVisitor ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isVisitor ? primaryColor : '#f3f4f6',
          color: isVisitor ? '#fff' : '#111827',
          fontSize: '14px',
          lineHeight: '1.4',
          wordBreak: 'break-word',
        }}
      >
        {isOperator && (
          <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '2px', opacity: 0.7 }}>
            {t('widget.operatorLabel')}
          </div>
        )}
        {message.content}
      </div>
    </div>
  )
}
