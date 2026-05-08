import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { usePostgres } from '../../../../tests/helpers/pgFixture'
import { PgSessionStore } from './pgSessionStore'
import { VisitorId, UsdCents, MessageId, ChunkId, SourceId } from '@support/shared'

describe('PgSessionStore @integration', () => {
  const pg = usePostgres()
  it('create + get + appendMessage + listMessages', async () => {
    await pg.pool.query('TRUNCATE sessions CASCADE')
    const store = new PgSessionStore(pg.pool)
    const s = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: { url: 'http://x' } })
    if (!s.ok) throw new Error('create failed')
    const m1 = await store.appendMessage({ sessionId: s.value.id, role: 'visitor', content: 'hi', costCents: UsdCents(0) })
    const m2 = await store.appendMessage({ sessionId: s.value.id, role: 'assistant', content: 'hello', costCents: UsdCents(2) })
    expect(m1.ok && m2.ok).toBe(true)
    const list = await store.listMessages(s.value.id, { limit: 10 })
    if (list.ok) {
      expect(list.value.length).toBe(2)
      expect(list.value[0]?.content).toBe('hi')
    }
    const reload = await store.getSession(s.value.id)
    expect(reload.ok && reload.value.totalCostCents === 2).toBe(true)
  })

  it('appendMessageWithId persists ragHits to rag_hits JSONB column', async () => {
    await pg.pool.query('TRUNCATE sessions CASCADE')
    const store = new PgSessionStore(pg.pool)
    const s = await store.createSession({ visitorId: VisitorId(randomUUID()), visitorMeta: {} })
    if (!s.ok) throw new Error('create failed')

    const chunkId = ChunkId(randomUUID())
    const sourceId = SourceId(randomUUID())
    const msgId = MessageId(randomUUID())
    const ragHits = [{ id: chunkId, sourceId, score: 0.92 }]

    const m = await store.appendMessageWithId({
      id: msgId, sessionId: s.value.id, role: 'assistant',
      content: 'context-aware reply', costCents: UsdCents(3),
      ragHits,
    })
    expect(m.ok).toBe(true)
    if (m.ok) {
      expect(m.value.ragHits).toBeDefined()
      expect(m.value.ragHits?.length).toBe(1)
      expect(m.value.ragHits?.[0]?.id).toBe(chunkId)
      expect(m.value.ragHits?.[0]?.sourceId).toBe(sourceId)
      expect(m.value.ragHits?.[0]?.score).toBeCloseTo(0.92)
    }

    // Verify it round-trips through listMessages
    const list = await store.listMessages(s.value.id, { limit: 10 })
    expect(list.ok).toBe(true)
    if (list.ok) {
      const assistantMsg = list.value.find((msg) => msg.role === 'assistant')
      expect(assistantMsg?.ragHits?.length).toBe(1)
      expect(assistantMsg?.ragHits?.[0]?.id).toBe(chunkId)
    }
  })
})
