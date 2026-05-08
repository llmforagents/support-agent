import { describe, it, expect } from 'vitest'
import { MemoryKnowledgeStore } from './memoryKnowledgeStore'

const txtConfig = { sourceType: 'txt' as const, fileRef: 'file-ref-1' }

describe('MemoryKnowledgeStore', () => {
  it('createSource returns a source with idle initial state', async () => {
    const store = new MemoryKnowledgeStore()
    const r = await store.createSource({ name: 'My Doc', sourceType: 'txt', config: txtConfig })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.name).toBe('My Doc')
    expect(r.value.state).toEqual({ status: 'idle', currentGeneration: 0 })
    expect(r.value.active).toBe(true)
    expect(r.value.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('getSource returns the created source', async () => {
    const store = new MemoryKnowledgeStore()
    const created = await store.createSource({ name: 'Doc', sourceType: 'md', config: { sourceType: 'md', fileRef: 'r1' } })
    if (!created.ok) throw new Error('createSource failed')
    const r = await store.getSource(created.value.id)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.id).toBe(created.value.id)
  })

  it('getSource returns source_not_found for unknown id', async () => {
    const store = new MemoryKnowledgeStore()
    const { SourceId } = await import('@support/shared')
    const r = await store.getSource(SourceId('00000000-0000-0000-0000-000000000000'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('source_not_found')
  })

  it('listSources returns all created sources', async () => {
    const store = new MemoryKnowledgeStore()
    await store.createSource({ name: 'A', sourceType: 'txt', config: txtConfig })
    await store.createSource({ name: 'B', sourceType: 'txt', config: txtConfig })
    const r = await store.listSources()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(2)
  })

  it('updateSourceState transitions to ingesting and bumps updatedAt', async () => {
    const store = new MemoryKnowledgeStore()
    const created = await store.createSource({ name: 'Doc', sourceType: 'txt', config: txtConfig })
    if (!created.ok) throw new Error('createSource failed')
    const before = created.value.updatedAt

    // Small delay so updatedAt will differ
    await new Promise((r) => setTimeout(r, 5))

    const newState = { status: 'ingesting' as const, currentGeneration: 0, pendingGeneration: 1, startedAt: new Date(), progress: { processed: 0, total: 0 } }
    const upd = await store.updateSourceState(created.value.id, newState)
    expect(upd.ok).toBe(true)

    const fetched = await store.getSource(created.value.id)
    if (!fetched.ok) throw new Error('getSource failed')
    expect(fetched.value.state).toEqual(newState)
    expect(fetched.value.updatedAt.getTime()).toBeGreaterThan(before.getTime())
  })

  it('updateSourceState returns source_not_found for unknown id', async () => {
    const store = new MemoryKnowledgeStore()
    const { SourceId } = await import('@support/shared')
    const r = await store.updateSourceState(SourceId('00000000-0000-0000-0000-000000000000'), { status: 'idle', currentGeneration: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('source_not_found')
  })

  it('updateSourceState transitions through all states', async () => {
    const store = new MemoryKnowledgeStore()
    const created = await store.createSource({ name: 'Doc', sourceType: 'txt', config: txtConfig })
    if (!created.ok) throw new Error('createSource failed')
    const { id } = created.value

    const now = new Date()
    const states = [
      { status: 'ingesting' as const, currentGeneration: 0, pendingGeneration: 1, startedAt: now, progress: { processed: 0, total: 0 } },
      { status: 'ready' as const, currentGeneration: 1, ingestedAt: now, chunkCount: 3 },
      { status: 'error' as const, currentGeneration: 1, error: { kind: 'file_read_failed', cause: 'test' }, failedAt: now },
      { status: 'paused' as const, currentGeneration: 1 },
      { status: 'idle' as const, currentGeneration: 1 },
    ]

    for (const state of states) {
      await store.updateSourceState(id, state)
      const r = await store.getSource(id)
      if (!r.ok) throw new Error('getSource failed')
      expect(r.value.state.status).toBe(state.status)
    }
  })

  it('setActive toggles active flag and bumps updatedAt', async () => {
    const store = new MemoryKnowledgeStore()
    const created = await store.createSource({ name: 'Doc', sourceType: 'txt', config: txtConfig })
    if (!created.ok) throw new Error('createSource failed')
    const before = created.value.updatedAt

    await new Promise((r) => setTimeout(r, 5))
    await store.setActive(created.value.id, false)

    const r = await store.getSource(created.value.id)
    if (!r.ok) throw new Error('getSource failed')
    expect(r.value.active).toBe(false)
    expect(r.value.updatedAt.getTime()).toBeGreaterThan(before.getTime())

    await store.setActive(created.value.id, true)
    const r2 = await store.getSource(created.value.id)
    if (!r2.ok) throw new Error('getSource failed')
    expect(r2.value.active).toBe(true)
  })

  it('setActive returns source_not_found for unknown id', async () => {
    const store = new MemoryKnowledgeStore()
    const { SourceId } = await import('@support/shared')
    const r = await store.setActive(SourceId('00000000-0000-0000-0000-000000000000'), false)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('source_not_found')
  })

  it('deleteSource removes the source from the store', async () => {
    const store = new MemoryKnowledgeStore()
    const created = await store.createSource({ name: 'Doc', sourceType: 'txt', config: txtConfig })
    if (!created.ok) throw new Error('createSource failed')
    const { id } = created.value

    const del = await store.deleteSource(id)
    expect(del.ok).toBe(true)

    const r = await store.getSource(id)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('source_not_found')
  })

  it('deleteSource is idempotent (no error on missing id)', async () => {
    const store = new MemoryKnowledgeStore()
    const { SourceId } = await import('@support/shared')
    const r = await store.deleteSource(SourceId('00000000-0000-0000-0000-000000000000'))
    expect(r.ok).toBe(true)
  })
})
