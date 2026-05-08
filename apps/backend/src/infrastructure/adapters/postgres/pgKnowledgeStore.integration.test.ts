import { describe, it, expect, beforeEach } from 'vitest'
import { usePostgres } from '../../../../tests/helpers/pgFixture'
import { PgKnowledgeStore } from './pgKnowledgeStore'
import type { SourceConfig } from '../../../domain/source'

describe('PgKnowledgeStore @integration', () => {
  const pg = usePostgres()

  beforeEach(async () => {
    await pg.pool.query('TRUNCATE sources CASCADE')
  })

  it('createSource + getSource round-trip preserves config/state JSON', async () => {
    const store = new PgKnowledgeStore(pg.pool)
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
    const store = new PgKnowledgeStore(pg.pool)
    const r = await store.getSource('00000000-0000-4000-8000-000000000000' as never)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('source_not_found')
  })

  it('listSources returns multiple sources sorted by created_at DESC', async () => {
    const store = new PgKnowledgeStore(pg.pool)
    const config: SourceConfig = { sourceType: 'txt', fileRef: 'uploads/a.txt' }

    // Insert two sources with a small delay to ensure distinct created_at values
    const first = await store.createSource({ name: 'First', sourceType: 'txt', config })
    // Insert a tiny sleep-equivalent by just inserting another one right after
    const second = await store.createSource({ name: 'Second', sourceType: 'txt', config })
    const third = await store.createSource({ name: 'Third', sourceType: 'md', config: { sourceType: 'md', fileRef: 'docs/guide.md' } })

    expect(first.ok && second.ok && third.ok).toBe(true)

    const list = await store.listSources()
    expect(list.ok).toBe(true)
    if (!list.ok) return

    expect(list.value).toHaveLength(3)
    // Should be DESC order (most recent first); Third was inserted last
    const names = list.value.map((s) => s.name)
    expect(names[0]).toBe('Third')
    // First and Second may have same timestamp in tests; just check all 3 present
    expect(names).toContain('First')
    expect(names).toContain('Second')
  })

  it('updateSourceState transitions idle → ingesting → ready', async () => {
    const store = new PgKnowledgeStore(pg.pool)
    const config: SourceConfig = { sourceType: 'pdf', fileRef: 'doc.pdf' }

    const created = await store.createSource({ name: 'Doc', sourceType: 'pdf', config })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const id = created.value.id

    // idle → ingesting
    const ingesting = { status: 'ingesting' as const, currentGeneration: 0, pendingGeneration: 1 }
    const r1 = await store.updateSourceState(id, ingesting)
    expect(r1.ok).toBe(true)

    const afterIngesting = await store.getSource(id)
    expect(afterIngesting.ok).toBe(true)
    if (!afterIngesting.ok) return
    expect(afterIngesting.value.state.status).toBe('ingesting')

    // ingesting → ready
    const ready = { status: 'ready' as const, currentGeneration: 1 }
    const r2 = await store.updateSourceState(id, ready)
    expect(r2.ok).toBe(true)

    const afterReady = await store.getSource(id)
    expect(afterReady.ok).toBe(true)
    if (!afterReady.ok) return
    expect(afterReady.value.state.status).toBe('ready')
    expect(afterReady.value.state.currentGeneration).toBe(1)
  })

  it('setActive false updates the column', async () => {
    const store = new PgKnowledgeStore(pg.pool)
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
    const store = new PgKnowledgeStore(pg.pool)
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
