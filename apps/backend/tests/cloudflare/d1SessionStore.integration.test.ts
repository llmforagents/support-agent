// Mirrors apps/backend/src/infrastructure/adapters/postgres/pgSessionStore.integration.test.ts
// test-by-test. Any drift between the two files is a bug — both adapters
// must satisfy the same SessionStorePort contract.
import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { env } from 'cloudflare:test'
import { runD1Migrations } from '../../src/infrastructure/adapters/cloudflare/d1Migrations'
import { D1SessionStore } from '../../src/infrastructure/adapters/cloudflare/d1SessionStore'
import { VisitorId, UsdCents, MessageId, ChunkId, SourceId } from '@support/shared'

describe('D1SessionStore @integration', () => {
  beforeEach(async () => {
    await runD1Migrations(env.DB)
    // CASCADE via foreign key sweeps messages too.
    await env.DB.prepare('DELETE FROM sessions').run()
  })

  it('create + get + appendMessage + listMessages', async () => {
    const store = new D1SessionStore(env.DB)
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
    const store = new D1SessionStore(env.DB)
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
