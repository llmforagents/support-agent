/**
 * messages.es.ts — Spanish message catalog for the widget embed app.
 */
const messages = {
  'widget.greeting': 'Hola 👋 ¿En qué te puedo ayudar?',
  'widget.placeholder': 'Escribí un mensaje…',
  'widget.statusOnline': '● En línea',
  'widget.statusOffline': '○ Respondemos pronto',
  'widget.statusHandoff': '⏳ Buscando un operador…',
  'widget.statusOperator': '● Operador conectado',
  'widget.send': 'Enviar',
  'widget.close': 'Cerrar',
} as const

export default messages
export type WidgetMessages = typeof messages
