export type HandoffTool = Readonly<{
  type: 'function'
  function: {
    name: 'request_human_handoff'
    description: string
    parameters: {
      type: 'object'
      properties: {
        reason: { type: 'string'; description: string }
        category: { type: 'string'; enum: readonly string[] }
      }
      required: readonly string[]
    }
  }
}>

export const HANDOFF_TOOL: HandoffTool = {
  type: 'function',
  function: {
    name: 'request_human_handoff',
    description:
      'Escala la conversación a un agente humano. Usá esto cuando: el visitante pide hablar con humano, expresa frustración persistente, hay un tema legal/médico/financiero serio, o no podés ayudar tras 2 intentos.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Razón concisa para el admin' },
        category: {
          type: 'string',
          enum: ['user_request', 'frustration', 'out_of_scope', 'sensitive_topic', 'repeated_failure'] as const,
        },
      },
      required: ['reason', 'category'] as const,
    },
  },
}

export const HANDOFF_TOOL_GUIDANCE = `
Si necesitás escalar a un humano (porque el visitante lo pide, está frustrado,
es un tema sensible, o no podés ayudar tras 2 intentos), llamá a la herramienta
"request_human_handoff" con una razón breve y la categoría apropiada. NO le digas
al usuario que vas a escalar — el sistema lo maneja automáticamente y notifica al
admin.
`.trim()

/**
 * Injected when toolEnabled=true but adminOnline=false.
 * Instructs the AI to acknowledge the user's request for a human gracefully
 * and offer an async alternative instead of making a promise it cannot keep.
 */
export const FALLBACK_NO_ADMIN_PROMPT = `
Si el visitante pide hablar con un humano: en este momento no hay agentes
disponibles. Decile educadamente que podés intentar ayudarlo vos mismo, o
que deje su email para que un humano lo contacte después.
`.trim()
