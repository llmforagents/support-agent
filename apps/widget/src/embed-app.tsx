/**
 * embed-app.tsx — Preact root for the iframe embed.
 *
 * Loaded inside /embed/:siteKey. Wires the SSE stream, API client,
 * and ChatPanel into a self-contained chat experience.
 */

import { render } from 'preact'
import { useState, useEffect, useRef, useId } from 'preact/hooks'
import type { JSX } from 'preact'
import type { ChatMessage, SseEvent, WidgetConfig } from './types'
import { getOrCreateVisitorId } from './types'
import { makeApiClient } from './lib/apiClient'
import { connectSse } from './lib/sseClient'
import type { SseClient } from './lib/sseClient'
import { ChatPanel } from './components/ChatPanel'
import { t } from './lib/i18n'

declare global {
  interface Window {
    __SITE_KEY__?: string
  }
}

// ─── App ─────────────────────────────────────────────────────────────────────

function App(): JSX.Element {
  const visitorId = getOrCreateVisitorId()
  const apiClient = makeApiClient(visitorId)
  const dialogTitleId = useId()

  const [config, setConfig] = useState<WidgetConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [streamToken, setStreamToken] = useState<string | null>(null)
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [streamingToken, setStreamingToken] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [conversationStatus, setConversationStatus] = useState<string | undefined>(undefined)

  const sseRef = useRef<SseClient | null>(null)
  const pendingMessageIdRef = useRef<string | null>(null)

  const siteKey = window.__SITE_KEY__ ?? ''

  // ── 1. Load widget config ─────────────────────────────────────────────────
  useEffect(() => {
    if (!siteKey) {
      setError('Widget is not configured (missing site key).')
      return
    }

    void apiClient.getConfig(siteKey).then((r) => {
      if (!r.ok) {
        // End-user-facing diagnostic — let support admins know config is broken
        console.error('[llm4agents widget] failed to load config', r.error)
        setError('Support is temporarily unavailable. Please try again later.')
        return
      }
      setConfig(r.value)
    })
  }, [siteKey]) // apiClient is stable (created from stable visitorId)

  // ── 2. Create session once config is available ────────────────────────────
  useEffect(() => {
    if (!config || sessionId) return

    void apiClient
      .createSession({
        url: window.location.href,
        userAgent: navigator.userAgent,
        language: navigator.language,
      })
      .then((r) => {
        if (!r.ok) {
          // End-user-facing diagnostic — lets support admins diagnose connectivity issues
          console.error('[llm4agents widget] failed to create session', r.error)
          setError('Could not start a session. Please refresh and try again.')
          return
        }
        setSessionId(r.value.sessionId)
        setStreamToken(r.value.streamToken)
      })
  }, [config]) // apiClient is stable

  // ── 3. Connect SSE once session is ready ──────────────────────────────────
  useEffect(() => {
    if (!sessionId || !streamToken) return

    const sse = connectSse({
      baseUrl: '',
      sessionId,
      streamToken,
      visitorId,
      onEvent: handleSseEvent,
      onError: (_err) => {
        // Reconnection is handled automatically by EventSource
      },
    })
    sseRef.current = sse

    return () => {
      sse.close()
      sseRef.current = null
    }
  }, [sessionId, streamToken, visitorId]) // handleSseEvent uses refs/setState — stable

  // ── SSE event handler ─────────────────────────────────────────────────────
  function handleSseEvent(event: SseEvent): void {
    switch (event.type) {
      case 'connected':
        break

      case 'token': {
        const { messageId, delta } = event
        pendingMessageIdRef.current = messageId
        setStreamingToken((prev) => (prev ?? '') + delta)
        break
      }

      case 'message': {
        const { message } = event
        const chatMsg: ChatMessage = {
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: new Date(message.createdAt),
        }
        // Flush streaming token: if this is the committed message for the
        // pending streaming turn, clear the token buffer
        if (message.id === pendingMessageIdRef.current) {
          setStreamingToken(null)
          pendingMessageIdRef.current = null
        }
        setMessages((prev) => [...prev, chatMsg])
        setSending(false)
        break
      }

      case 'admin_status':
        setConfig((prev) => (prev ? { ...prev, adminOnline: event.online } : prev))
        break

      case 'closed':
        // Session closed by backend/timeout
        setError('This conversation has ended.')
        sseRef.current?.close()
        break

      case 'error':
        setSending(false)
        setStreamingToken(null)
        break

      case 'state_changed':
        setConversationStatus(event.to.status)
        break

      case 'ping':
        break
    }
  }

  // ── Send message ──────────────────────────────────────────────────────────
  function handleSend(content: string): void {
    if (!sessionId || sending) return

    const visitorMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'visitor',
      content,
      createdAt: new Date(),
    }
    setMessages((prev) => [...prev, visitorMsg])
    setSending(true)

    void apiClient.postMessage(sessionId, content).then((r) => {
      if (!r.ok) {
        setSending(false)
        return
      }
      // Update stream token so the SSE stays authorized for the next turn
      setStreamToken(r.value.streamToken)
    })
  }

  // ── ESC key closes the widget ─────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, []) // handleClose is stable (no deps)

  // ── Close (postMessage to bootstrap) ─────────────────────────────────────
  function handleClose(): void {
    window.parent.postMessage('llm4agents:close', '*')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          // #4b5563 = 7.6:1 on white — passes AA for normal text
          color: '#4b5563',
          fontSize: '14px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        {error}
      </div>
    )
  }

  if (!config) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontFamily: 'system-ui, sans-serif',
          // #4b5563 passes AA on white (7.6:1) — gray-400/500 do not
          color: '#4b5563',
          fontSize: '14px',
        }}
      >
        Loading…
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={dialogTitleId}
      style={{ height: '100%' }}
    >
      <span id={dialogTitleId} className="sr-only">
        {`${config.siteName} — ${t('widget.chatDialogLabel')}`}
      </span>
      <ChatPanel
        config={config}
        messages={messages}
        streamingToken={streamingToken}
        sending={sending}
        {...(conversationStatus !== undefined ? { conversationStatus } : {})}
        onSend={handleSend}
        onClose={handleClose}
      />
    </div>
  )
}

// ── Mount ──────────────────────────────────────────────────────────────────

const root = document.getElementById('app')
if (root) {
  render(<App />, root)
}
