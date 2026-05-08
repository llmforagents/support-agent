import { describe, it, expect, vi } from 'vitest'
import { Llm4AgentsEmbedderAdapter } from './embedderAdapter'

describe('Llm4AgentsEmbedderAdapter', () => {
  it('returns embeddings from SDK', async () => {
    const fakeClient = {
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [
            { embedding: [0.1, 0.2, 0.3] },
            { embedding: [0.4, 0.5, 0.6] },
          ],
        }),
      },
    }
    const adapter = new Llm4AgentsEmbedderAdapter('text-embedding-3-small', 1536, undefined, () => fakeClient as never)
    const r = await adapter.embed(['hello', 'world'], 'sk-proxy-x')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])
  })

  it('returns Err on SDK failure', async () => {
    const fakeClient = {
      embeddings: { create: vi.fn().mockRejectedValue(new Error('boom')) },
    }
    const adapter = new Llm4AgentsEmbedderAdapter('m', 1536, undefined, () => fakeClient as never)
    const r = await adapter.embed(['hi'], 'sk')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('embedding_provider_failed')
  })

  it('empty input returns empty array without calling SDK', async () => {
    const create = vi.fn()
    const adapter = new Llm4AgentsEmbedderAdapter('m', 1536, undefined, () => ({ embeddings: { create } } as never))
    const r = await adapter.embed([], 'sk')
    expect(r.ok && r.value.length === 0).toBe(true)
    expect(create).not.toHaveBeenCalled()
  })

  it('passes the correct model and texts to the SDK', async () => {
    const create = vi.fn().mockResolvedValue({ data: [{ embedding: [0.1] }] })
    const adapter = new Llm4AgentsEmbedderAdapter('text-embedding-ada-002', 1536, undefined, () => ({ embeddings: { create } } as never))
    await adapter.embed(['test text'], 'sk-proxy-abc')
    expect(create).toHaveBeenCalledWith({ model: 'text-embedding-ada-002', input: ['test text'] })
  })

  it('exposes dimension property', () => {
    const adapter = new Llm4AgentsEmbedderAdapter('m', 768)
    expect(adapter.dimension).toBe(768)
  })

  it('error message includes SDK error string', async () => {
    const fakeClient = {
      embeddings: { create: vi.fn().mockRejectedValue(new Error('rate limited')) },
    }
    const adapter = new Llm4AgentsEmbedderAdapter('m', 1536, undefined, () => fakeClient as never)
    const r = await adapter.embed(['x'], 'sk')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('embedding_provider_failed')
      if (r.error.kind === 'embedding_provider_failed') {
        expect(r.error.cause).toContain('rate limited')
      }
    }
  })
})
