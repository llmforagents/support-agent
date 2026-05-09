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
} as const

export default messages
export type WidgetMessages = typeof messages
