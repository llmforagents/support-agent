import { LLM4AgentsClient } from '@llmforagents/sdk'
import { UsdCents } from '@support/shared'
import type { LlmPort, LlmRequest, LlmStreamEvent } from '../../../application/ports'

export type LlmClientFactory = (apiKey: string, apiBase?: string) => InstanceType<typeof LLM4AgentsClient>

const realFactory: LlmClientFactory = (apiKey, apiBase) =>
  new LLM4AgentsClient({ apiKey, ...(apiBase ? { baseUrl: apiBase } : {}) })

// Internal type that covers both the real SDK `done` shape (response.usage)
// and the flat `usage` shape used in unit test mocks.
type CompatEvent =
  | { type: 'text'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool_start'; name: string; args: Readonly<Record<string, unknown>> }
  | { type: 'tool_end'; name: string; result: { text: string }; durationMs: number }
  | { type: 'done'; response?: { usage: { promptTokens: number; completionTokens: number } }; usage?: { promptTokens: number; completionTokens: number; costCents?: number } }
  | { type: 'meta' | 'fallback' }

export class Llm4AgentsLlmAdapter implements LlmPort {
  constructor(
    private readonly factory: LlmClientFactory = realFactory,
    private readonly apiBase?: string,
  ) {}

  async *chatStream(req: LlmRequest): AsyncGenerator<LlmStreamEvent, void, void> {
    const client = this.factory(req.apiKey, this.apiBase)
    const conv = client.chat.conversation({
      model: req.model,
      system: req.system,
      history: req.messages.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })),
      signal: req.abort,
    })
    const lastUserMsg = req.messages[req.messages.length - 1]?.content ?? ''
    for await (const raw of conv.stream(lastUserMsg) as AsyncIterable<CompatEvent>) {
      switch (raw.type) {
        case 'text': yield { type: 'text', delta: raw.content }; break
        case 'reasoning': yield { type: 'reasoning', delta: raw.content }; break
        case 'tool_start': yield { type: 'tool_start', name: raw.name, argsJson: JSON.stringify(raw.args) }; break
        case 'tool_end': yield { type: 'tool_end', name: raw.name, resultText: raw.result.text, durationMs: raw.durationMs }; break
        case 'done': {
          const u = raw.response?.usage ?? raw.usage
          yield {
            type: 'done',
            usage: { promptTokens: u?.promptTokens ?? 0, completionTokens: u?.completionTokens ?? 0 },
            costCents: UsdCents(Math.max(0, Math.round(raw.usage?.costCents ?? 0))),
          }
          break
        }
        case 'meta':
        case 'fallback':
          break
      }
    }
  }
}


