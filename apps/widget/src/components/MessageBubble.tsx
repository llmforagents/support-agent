import type { JSX } from 'preact'
import type { ChatMessage } from '../types'

export type MessageBubbleProps = Readonly<{
  message: ChatMessage
  primaryColor: string
}>

export function MessageBubble({ message, primaryColor }: MessageBubbleProps): JSX.Element {
  const isVisitor = message.role === 'visitor'
  const isSystem = message.role === 'system_event'

  if (isSystem) {
    return (
      <div
        style={{
          textAlign: 'center',
          fontSize: '12px',
          color: '#6b7280',
          padding: '4px 8px',
          fontStyle: 'italic',
        }}
      >
        {message.content}
      </div>
    )
  }

  return (
    <div
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
        {message.role === 'operator' && (
          <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '2px', opacity: 0.7 }}>
            Support agent
          </div>
        )}
        {message.content}
      </div>
    </div>
  )
}
