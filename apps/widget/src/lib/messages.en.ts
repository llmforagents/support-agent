/**
 * messages.en.ts — English message catalog for the widget embed app.
 */
const messages = {
  'widget.greeting': 'Hello 👋 How can I help you?',
  'widget.placeholder': 'Type a message…',
  'widget.statusOnline': '● Online',
  'widget.statusOffline': '○ We\'ll reply soon',
  'widget.statusHandoff': '⏳ Looking for an operator…',
  'widget.statusOperator': '● Operator connected',
  'widget.send': 'Send',
  'widget.close': 'Close',
  'widget.chatDialogLabel': 'Support chat',
  'widget.inputLabel': 'Message',
  'widget.yourMessage': 'Your message',
  'widget.agentMessage': 'Agent message',
  'widget.operatorMessage': 'Support operator message',
  'widget.systemEvent': 'Status update',
  'widget.assistantTyping': 'Assistant is typing',
  'widget.assistantStreaming': 'Assistant reply (in progress)',
  'widget.messageListLabel': 'Conversation messages',
  'widget.operatorLabel': 'Support agent',
} as const

export default messages
export type WidgetMessages = typeof messages
