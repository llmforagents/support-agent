import type { JSX } from 'preact'
import { useEffect, useRef, useId } from 'preact/hooks'
import type { ChatMessage, WidgetConfig } from '../types'
import { Header } from './Header'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'
import { t } from '../lib/i18n'

export type ChatPanelProps = Readonly<{
  config: WidgetConfig
  messages: readonly ChatMessage[]
  /** Streamed partial token from the current assistant turn, or null */
  streamingToken: string | null
  sending: boolean
  /** Current conversation status, e.g. 'handoff_requested' | 'active_operator' */
  conversationStatus?: string
  onSend: (content: string) => void
  onClose: () => void
}>

export function ChatPanel({
  config,
  messages,
  streamingToken,
  sending,
  conversationStatus,
  onSend,
  onClose,
}: ChatPanelProps): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputId = useId()

  // Auto-scroll to bottom when messages change or new tokens arrive.
  // `behavior: 'smooth'` is overridden to 'auto' by prefers-reduced-motion via the
  // global `scroll-behavior: auto !important` rule in embed.html.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingToken])

  const isInputDisabled = sending || streamingToken !== null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        background: '#fff',
        borderRadius: '16px',
        overflow: 'hidden',
      }}
    >
      <Header
        siteName={config.siteName}
        primaryColor={config.primaryColor}
        adminOnline={config.adminOnline}
        {...(conversationStatus !== undefined ? { conversationStatus } : {})}
        onClose={onClose}
      />

      {/* Message list — announces new additions to AT */}
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-atomic="false"
        aria-label={t('widget.messageListLabel')}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              // #4b5563 = 7.6:1 on white (AA pass). #9ca3af = 2.9:1 (FAIL).
              color: '#4b5563',
              fontSize: '14px',
            }}
          >
            <p>{t('widget.greeting')}</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} primaryColor={config.primaryColor} />
        ))}

        {/* Streaming token bubble */}
        {streamingToken !== null && streamingToken.length > 0 && (
          <div
            role="article"
            aria-label={t('widget.assistantStreaming')}
            style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '8px' }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '8px 12px',
                borderRadius: '16px 16px 16px 4px',
                background: '#f3f4f6',
                color: '#111827',
                fontSize: '14px',
                lineHeight: '1.4',
              }}
            >
              {streamingToken}
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: '2px',
                  height: '14px',
                  background: '#6b7280',
                  marginLeft: '2px',
                  verticalAlign: 'text-bottom',
                  animation: 'blink 1s step-end infinite',
                }}
              />
            </div>
          </div>
        )}

        {/* Typing indicator when sending but no tokens yet */}
        {sending && streamingToken === null && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '8px' }}>
            <div
              role="status"
              aria-live="polite"
              aria-label={t('widget.assistantTyping')}
              style={{
                padding: '8px 14px',
                borderRadius: '16px',
                background: '#f3f4f6',
                // #4b5563 = 7.6:1 on the #f3f4f6 bubble — passes AA
                color: '#4b5563',
                fontSize: '14px',
              }}
            >
              <span aria-hidden="true">…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <InputArea
        inputId={inputId}
        disabled={isInputDisabled}
        primaryColor={config.primaryColor}
        onSend={onSend}
      />
    </div>
  )
}
