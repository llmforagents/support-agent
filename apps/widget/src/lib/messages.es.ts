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
  'widget.chatDialogLabel': 'Chat de soporte',
  'widget.inputLabel': 'Mensaje',
  'widget.yourMessage': 'Tu mensaje',
  'widget.agentMessage': 'Mensaje del agente',
  'widget.operatorMessage': 'Mensaje del operador',
  'widget.systemEvent': 'Actualización de estado',
  'widget.assistantTyping': 'El asistente está escribiendo',
  'widget.assistantStreaming': 'Respuesta del asistente (en progreso)',
  'widget.messageListLabel': 'Mensajes de la conversación',
  'widget.operatorLabel': 'Agente de soporte',
} as const

export default messages
export type WidgetMessages = typeof messages
