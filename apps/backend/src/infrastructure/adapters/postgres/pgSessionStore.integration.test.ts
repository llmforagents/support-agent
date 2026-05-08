import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { usePostgres } from '../../../../tests/helpers/pgFixture'
import { PgSessionStore } from './pgSessionStore'
import { VisitorId, UsdCents } from '@support/shared'

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
})
