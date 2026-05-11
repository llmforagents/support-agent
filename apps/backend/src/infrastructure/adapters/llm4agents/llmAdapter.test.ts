import { describe, it, expect, vi } from 'vitest'
import { Llm4AgentsLlmAdapter } from './llmAdapter'
import type { LlmTool } from '../../../application/ports'

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

  it('passes tools to the SDK conversation factory when tools are provided', async () => {
    const conversationMock = vi.fn().mockReturnValue({
      stream: vi.fn().mockReturnValue(fakeStream([
        { type: 'done', usage: { promptTokens: 5, completionTokens: 2 } },
      ])),
    })
    const fakeClient = { chat: { conversation: conversationMock } }
    const adapter = new Llm4AgentsLlmAdapter(() => fakeClient as never)

    const tool: LlmTool = {
      type: 'function',
      function: {
        name: 'request_human_handoff',
        description: 'Escalate to human',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    }

    for await (const _ of adapter.chatStream({
      apiKey: 'sk-proxy-xxxxxxxxxx',
      model: 'm', system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [tool],
      abort: new AbortController().signal,
    })) { /* drain */ }

    expect(conversationMock).toHaveBeenCalledOnce()
    const callArgs = conversationMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs).toHaveProperty('tools')
    // tools shim must expose getDefinitions()
    const toolsArg = callArgs['tools'] as { getDefinitions: () => Promise<unknown[]> }
    const defs = await toolsArg.getDefinitions()
    expect(defs).toHaveLength(1)
    expect((defs[0] as { function: { name: string } }).function.name).toBe('request_human_handoff')
  })

  it('omits tools from conversation factory when tools is undefined', async () => {
    const conversationMock = vi.fn().mockReturnValue({
      stream: vi.fn().mockReturnValue(fakeStream([
        { type: 'done', usage: { promptTokens: 5, completionTokens: 2 } },
      ])),
    })
    const fakeClient = { chat: { conversation: conversationMock } }
    const adapter = new Llm4AgentsLlmAdapter(() => fakeClient as never)

    for await (const _ of adapter.chatStream({
      apiKey: 'sk-proxy-xxxxxxxxxx',
      model: 'm', system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      abort: new AbortController().signal,
    })) { /* drain */ }

    const callArgs = conversationMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs).not.toHaveProperty('tools')
  })

  it('mcp only: when mcpEnabled=true and no local tools, passes SDK client.tools directly', async () => {
    const sdkToolsDefs = [
      { type: 'function', function: { name: 'mcp_fetch_html', description: 'd', parameters: {} } },
      { type: 'function', function: { name: 'mcp_google_search', description: 'd', parameters: {} } },
    ]
    const sdkTools = {
      getDefinitions: vi.fn().mockResolvedValue(sdkToolsDefs),
      call: vi.fn(),
    }
    const conversationMock = vi.fn().mockReturnValue({
      stream: vi.fn().mockReturnValue(fakeStream([
        { type: 'done', usage: { promptTokens: 5, completionTokens: 2 } },
      ])),
    })
    const fakeClient = { chat: { conversation: conversationMock }, tools: sdkTools }
    const adapter = new Llm4AgentsLlmAdapter(() => fakeClient as never)

    for await (const _ of adapter.chatStream({
      apiKey: 'sk-proxy-xxxxxxxxxx',
      model: 'm', system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      abort: new AbortController().signal,
      mcpEnabled: true,
    })) { /* drain */ }

    const callArgs = conversationMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs).toHaveProperty('tools')
    // When MCP-only, the SDK's tools instance is passed straight through.
    expect(callArgs['tools']).toBe(sdkTools)
  })

  it('mcp + handoff: when both are active, getDefinitions returns handoff + MCP defs', async () => {
    const sdkToolsDefs = [
      { type: 'function', function: { name: 'mcp_fetch_html', description: 'd', parameters: {} } },
    ]
    const sdkTools = {
      getDefinitions: vi.fn().mockResolvedValue(sdkToolsDefs),
      call: vi.fn().mockResolvedValue({ content: [], text: 'mcp-result', raw: [] }),
    }
    const conversationMock = vi.fn().mockReturnValue({
      stream: vi.fn().mockReturnValue(fakeStream([
        { type: 'done', usage: { promptTokens: 5, completionTokens: 2 } },
      ])),
    })
    const fakeClient = { chat: { conversation: conversationMock }, tools: sdkTools }
    const adapter = new Llm4AgentsLlmAdapter(() => fakeClient as never)

    const handoffTool: LlmTool = {
      type: 'function',
      function: {
        name: 'request_human_handoff',
        description: 'Escalate to human',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    }

    for await (const _ of adapter.chatStream({
      apiKey: 'sk-proxy-xxxxxxxxxx',
      model: 'm', system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [handoffTool],
      mcpEnabled: true,
      abort: new AbortController().signal,
    })) { /* drain */ }

    const callArgs = conversationMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs).toHaveProperty('tools')
    const toolsArg = callArgs['tools'] as {
      getDefinitions: () => Promise<readonly { function: { name: string } }[]>
      call: (name: string, args: Record<string, unknown>) => Promise<{ text: string }>
    }
    const defs = await toolsArg.getDefinitions()
    expect(defs).toHaveLength(2)
    expect(defs[0]?.function.name).toBe('request_human_handoff')
    expect(defs[1]?.function.name).toBe('mcp_fetch_html')

    // Wrapper delegates call() to the SDK's tools instance.
    const result = await toolsArg.call('mcp_fetch_html', { url: 'x' })
    expect(result.text).toBe('mcp-result')
    expect(sdkTools.call).toHaveBeenCalledWith('mcp_fetch_html', { url: 'x' }, undefined)
  })

  it('mcp off + handoff off: no tools option is sent even if mcpEnabled is undefined', async () => {
    const conversationMock = vi.fn().mockReturnValue({
      stream: vi.fn().mockReturnValue(fakeStream([
        { type: 'done', usage: { promptTokens: 5, completionTokens: 2 } },
      ])),
    })
    const sdkTools = { getDefinitions: vi.fn(), call: vi.fn() }
    const fakeClient = { chat: { conversation: conversationMock }, tools: sdkTools }
    const adapter = new Llm4AgentsLlmAdapter(() => fakeClient as never)

    for await (const _ of adapter.chatStream({
      apiKey: 'sk-proxy-xxxxxxxxxx',
      model: 'm', system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      abort: new AbortController().signal,
    })) { /* drain */ }

    const callArgs = conversationMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs).not.toHaveProperty('tools')
    expect(sdkTools.getDefinitions).not.toHaveBeenCalled()
  })
})
