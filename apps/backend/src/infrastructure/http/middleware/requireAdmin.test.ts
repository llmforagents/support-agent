import '../../../types'
import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { requireAdmin } from './requireAdmin'
import { errorHandler } from './errorHandler'
import { MemoryAdminStore } from '../../adapters/memory/memoryAdminStore'
import { MemoryAdminSessionStore } from '../../adapters/memory/memoryAdminSessionStore'
import { createHash } from 'node:crypto'
import { hashPassword } from '../../crypto/passwordHash'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

// A valid 64-char hex token (32 bytes in hex)
const VALID_TOKEN = 'a'.repeat(64)

async function buildApp() {
  const adminStore = new MemoryAdminStore()
  const sessionStore = new MemoryAdminSessionStore()
  const ins = await adminStore.insertAdmin({ email: 'a@x.com', passwordHash: await hashPassword('p') })
  if (!ins.ok) throw new Error('seed failed')
  await sessionStore.insert({ adminId: ins.value.id, tokenHash: sha256(VALID_TOKEN), expiresAt: new Date(Date.now() + 60_000) })
  const app = new Hono()
  app.use('*', errorHandler())
  app.use('*', requireAdmin({ adminStore, sessionStore, sha256 }))
  app.get('/', (c) => c.json({ adminEmail: c.get('admin').email }))
  return app
}

describe('requireAdmin', () => {
  it('rejects without cookie → 401', async () => {
    const app = await buildApp()
    const res = await app.request('/')
    expect(res.status).toBe(401)
  })
  it('accepts valid cookie', async () => {
    const app = await buildApp()
    const res = await app.request('/', { headers: { cookie: `session=${VALID_TOKEN}` } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ adminEmail: 'a@x.com' })
  })
  it('rejects malformed cookie', async () => {
    const app = await buildApp()
    const res = await app.request('/', { headers: { cookie: 'session=BAD' } })
    expect(res.status).toBe(401)
  })
})
