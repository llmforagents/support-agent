import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/preact'
import type { ChatMessage, WidgetConfig } from '../types'
import { ChatPanel } from './ChatPanel'

const config: WidgetConfig = {
  siteKey: 'test-site-key-0000000000',
  siteName: 'Acme Support',
  primaryColor: '#4f46e5',
  adminOnline: true,
}

const messages: readonly ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'visitor',
    content: 'Hello, I need help',
    createdAt: new Date('2024-01-01T10:00:00Z'),
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'Hi! How can I help you today?',
    createdAt: new Date('2024-01-01T10:00:05Z'),
  },
]

describe('ChatPanel', () => {
  it('renders the site name in the header', () => {
    render(
      <ChatPanel
        config={config}
        messages={[]}
        streamingToken={null}
        sending={false}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Acme Support')).toBeInTheDocument()
  })

  it('renders visitor and assistant messages', () => {
    render(
      <ChatPanel
        config={config}
        messages={messages}
        streamingToken={null}
        sending={false}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Hello, I need help')).toBeInTheDocument()
    expect(screen.getByText('Hi! How can I help you today?')).toBeInTheDocument()
  })

  it('shows typing indicator while sending with no streaming token', () => {
    render(
      <ChatPanel
        config={config}
        messages={[]}
        streamingToken={null}
        sending={true}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('status', { name: /typing/i })).toBeInTheDocument()
  })

  it('shows streaming token content when present', () => {
    render(
      <ChatPanel
        config={config}
        messages={[]}
        streamingToken="Hello, I am"
        sending={true}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/Hello, I am/)).toBeInTheDocument()
  })

  it('calls onSend when a message is submitted via button click', () => {
    const onSend = vi.fn()
    render(
      <ChatPanel
        config={config}
        messages={[]}
        streamingToken={null}
        sending={false}
        onSend={onSend}
        onClose={vi.fn()}
      />,
    )

    const textarea = screen.getByPlaceholderText(/type a message/i)
    // aria-label is the i18n 'widget.send' key — matches 'Send' or 'Enviar'
    const sendButton = screen.getByRole('button', { name: /send|enviar/i })

    fireEvent.input(textarea, { target: { value: 'Test message' } })
    fireEvent.click(sendButton)

    expect(onSend).toHaveBeenCalledWith('Test message')
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <ChatPanel
        config={config}
        messages={[]}
        streamingToken={null}
        sending={false}
        onSend={vi.fn()}
        onClose={onClose}
      />,
    )
    // aria-label is the i18n 'widget.close' key — matches 'Close' or 'Cerrar'
    fireEvent.click(screen.getByRole('button', { name: /close|cerrar/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('disables input while sending', () => {
    render(
      <ChatPanel
        config={config}
        messages={[]}
        streamingToken={null}
        sending={true}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const textarea = screen.getByPlaceholderText(/type a message/i)
    expect(textarea).toBeDisabled()
  })

  it('shows empty state when no messages', () => {
    render(
      <ChatPanel
        config={config}
        messages={[]}
        streamingToken={null}
        sending={false}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    // Greeting comes from i18n — match either Spanish or English
    expect(screen.getByText(/hola|hello/i)).toBeInTheDocument()
  })
})
