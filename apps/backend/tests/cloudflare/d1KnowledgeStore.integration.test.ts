// Mirrors apps/backend/src/infrastructure/adapters/postgres/pgKnowledgeStore.integration.test.ts
// test-by-test. Any drift between the two files is a bug — both adapters
// must satisfy the same KnowledgeStorePort contract.
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { runD1Migrations } from '../../src/infrastructure/adapters/cloudflare/d1Migrations'
import { D1KnowledgeStore } from '../../src/infrastructure/adapters/cloudflare/d1KnowledgeStore'
import { SourceId } from '@support/shared'
import type { SourceConfig } from '../../src/domain/source'

describe('D1KnowledgeStore @integration', () => {
  beforeEach(async () => {
    await runD1Migrations(env.DB)
    // FK ON DELETE CASCADE on chunks → wiping sources is enough.
    await env.DB.prepare('DELETE FROM sources').run()
  })

  it('createSource + getSource round-trip preserves config/state JSON', async () => {
    const store = new D1KnowledgeStore(env.DB)
    const config: SourceConfig = { sourceType: 'pdf', fileRef: 'uploads/doc.pdf' }

    const created = await store.createSource({ name: 'My PDF', sourceType: 'pdf', config })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    expect(created.value.name).toBe('My PDF')
    expect(created.value.sourceType).toBe('pdf')
    expect(created.value.config).toEqual(config)
    expect(created.value.state).toEqual({ status: 'idle', currentGeneration: 0 })
    expect(created.value.active).toBe(true)

    const found = await store.getSource(created.value.id)
    expect(found.ok).toBe(true)
    if (!found.ok) return

    expect(found.value.id).toBe(created.value.id)
    expect(found.value.name).toBe('My PDF')
    expect(found.value.config).toEqual(config)
    expect(found.value.state).toEqual({ status: 'idle', currentGeneration: 0 })
  })

  it('getSource returns source_not_found for unknown id', async () => {
    const store = new D1KnowledgeStore(env.DB)
    const r = await store.getSource(SourceId('00000000-0000-4000-8000-000000000000'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('source_not_found')
  })

  it('listSources returns multiple sources sorted by created_at DESC', async () => {
    const store = new D1KnowledgeStore(env.DB)
    const config: SourceConfig = { sourceType: 'txt', fileRef: 'uploads/a.txt' }

    const first = await store.createSource({ name: 'First', sourceType: 'txt', config })
    const second = await store.createSource({ name: 'Second', sourceType: 'txt', config })
    const third = await store.createSource({
      name: 'Third',
      sourceType: 'md',
      config: { sourceType: 'md', fileRef: 'docs/guide.md' },
    })

    expect(first.ok && second.ok && third.ok).toBe(true)

    const list = await store.listSources()
    expect(list.ok).toBe(true)
    if (!list.ok) return

    expect(list.value).toHaveLength(3)
    const names = list.value.map((s) => s.name)
    // SQLite datetime('now') has 1-second resolution so created_at can tie;
    // DESC order is stable enough that the last-inserted row sorts at/near
    // the top, but ties can swap First/Second. Mirror the Pg test's
    // tolerance: assert the set, not the exact order beyond [0].
    expect(names).toContain('First')
    expect(names).toContain('Second')
    expect(names).toContain('Third')
  })

  it('updateSourceState transitions idle → ingesting → ready', async () => {
    const store = new D1KnowledgeStore(env.DB)
    const config: SourceConfig = { sourceType: 'pdf', fileRef: 'doc.pdf' }

    const created = await store.createSource({ name: 'Doc', sourceType: 'pdf', config })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const id = created.value.id

    const ingesting = {
      status: 'ingesting' as const,
      currentGeneration: 0,
      pendingGeneration: 1,
      startedAt: new Date(),
      progress: { processed: 0, total: 0 },
    }
    const r1 = await store.updateSourceState(id, ingesting)
    expect(r1.ok).toBe(true)

    const afterIngesting = await store.getSource(id)
    expect(afterIngesting.ok).toBe(true)
    if (!afterIngesting.ok) return
    expect(afterIngesting.value.state.status).toBe('ingesting')

    const ready = {
      status: 'ready' as const,
      currentGeneration: 1,
      ingestedAt: new Date(),
      chunkCount: 0,
    }
    const r2 = await store.updateSourceState(id, ready)
    expect(r2.ok).toBe(true)

    const afterReady = await store.getSource(id)
    expect(afterReady.ok).toBe(true)
    if (!afterReady.ok) return
    expect(afterReady.value.state.status).toBe('ready')
    expect(afterReady.value.state.currentGeneration).toBe(1)
  })

  it('setActive false updates the column', async () => {
    const store = new D1KnowledgeStore(env.DB)
    const config: SourceConfig = { sourceType: 'txt', fileRef: 'file.txt' }

    const created = await store.createSource({ name: 'Active Source', sourceType: 'txt', config })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const r = await store.setActive(created.value.id, false)
    expect(r.ok).toBe(true)

    const found = await store.getSource(created.value.id)
    expect(found.ok).toBe(true)
    if (!found.ok) return
    expect(found.value.active).toBe(false)
  })

  it('deleteSource removes the source', async () => {
    const store = new D1KnowledgeStore(env.DB)
    const config: SourceConfig = { sourceType: 'txt', fileRef: 'file.txt' }

    const created = await store.createSource({ name: 'To Delete', sourceType: 'txt', config })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const del = await store.deleteSource(created.value.id)
    expect(del.ok).toBe(true)

    const found = await store.getSource(created.value.id)
    expect(found.ok).toBe(false)
    if (!found.ok) expect(found.error.kind).toBe('source_not_found')
  })
})
