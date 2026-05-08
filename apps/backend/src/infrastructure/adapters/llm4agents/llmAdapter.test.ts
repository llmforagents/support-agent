import { describe, it, expect, vi } from 'vitest'
import { Llm4AgentsLlmAdapter } from './llmAdapter'

function fakeStream(events: Array<{ type: 'text' | 'done'; content?: string; usage?: unknown }>) {
  return (async function* () {
    await Promise.resolve()
    for (const e of events) yield e
  })()
}

describe('Llm4AgentsLlmAdapter', () => {
  it('translates SDK stream events to LlmStreamEvent', async () => {
    const fakeClient = {
      chat: {
        conversation: vi.fn().mockReturnValue({
          stream: vi.fn().mockReturnValue(fakeStream([
            { type: 'text', content: 'hello ' },
            { type: 'text', content: 'world' },
            { type: 'done', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
          ])),
        }),
      },
    }
    const adapter = new Llm4AgentsLlmAdapter(() => fakeClient as never)
    const events: unknown[] = []
    for await (const ev of adapter.chatStream({
      apiKey: 'sk-proxy-xxxxxxxxxx',
      model: 'm', system: 's', messages: [{ role: 'user', content: 'hi' }],
      abort: new AbortController().signal,
    })) {
      events.push(ev)
    }
    expect(events).toEqual([
      { type: 'text', delta: 'hello ' },
      { type: 'text', delta: 'world' },
      { type: 'done', usage: { promptTokens: 10, completionTokens: 5 }, costCents: 0 },
    ])
  })
})
