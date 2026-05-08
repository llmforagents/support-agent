import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../../../../tests/helpers/testApp'
import { hashPassword } from '../../crypto/passwordHash'

async function loggedIn() {
  const { app, container } = buildTestApp()
  await container.adminStore.insertAdmin({ email: 'a@b.com', passwordHash: await hashPassword('correct horse battery') })
  // Seed site config so ingestSource can read the API key
  await container.siteConfigStore.upsertOnboarding({
    siteKey: 'X', siteName: 'A', primaryColor: '#000',
    llm4agentsApiKeyEncrypted: 'enc::sk-proxy-x', agentModel: 'm', embeddingModel: 'e', embeddingDim: 1536,
    systemPrompt: 'p', mcpEnabled: false,
    handoffPolicy: { autoOnLowConfidence: false, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90000, toolEnabled: false },
    adminOnline: false, onboardingStep: 9, onboardingCompleted: true,
  })
  // Login
  const login = await app.request('/v1/admin/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.com', password: 'correct horse battery' }),
  })
  const sessionCookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? ''
  // GET sources to receive the csrf cookie
  const csrfRes = await app.request('/v1/admin/sources', { headers: { cookie: sessionCookie } })
  const csrfMatch = /csrf=([0-9a-f]+)/.exec(csrfRes.headers.get('Set-Cookie') ?? '')
  const csrfToken = csrfMatch?.[1] ?? ''
  return { app, container, cookie: `${sessionCookie}; csrf=${csrfToken}`, csrfToken }
}

describe('admin sources routes', () => {
  it('GET /v1/admin/sources returns empty list initially', async () => {
    const { app, cookie } = await loggedIn()
    const res = await app.request('/v1/admin/sources', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json() as { sources: unknown[] }
    expect(body.sources).toEqual([])
  })

  it('POST /v1/admin/sources creates txt source via multipart and starts ingest', async () => {
    const { app, cookie, csrfToken } = await loggedIn()
    const fd = new FormData()
    fd.append('name', 'My doc')
    fd.append('type', 'txt')
    fd.append('file', new Blob(['hello world from a doc'], { type: 'text/plain' }), 'doc.txt')
    const res = await app.request('/v1/admin/sources', {
      method: 'POST', headers: { cookie, 'X-CSRF-Token': csrfToken },
      body: fd,
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { id: string; name: string }
    expect(body.name).toBe('My doc')
    expect(typeof body.id).toBe('string')
  })

  it('POST /v1/admin/sources rejects missing name', async () => {
    const { app, cookie, csrfToken } = await loggedIn()
    const fd = new FormData()
    fd.append('type', 'txt')
    fd.append('file', new Blob(['x'], { type: 'text/plain' }), 'd.txt')
    const res = await app.request('/v1/admin/sources', {
      method: 'POST', headers: { cookie, 'X-CSRF-Token': csrfToken }, body: fd,
    })
    expect(res.status).toBe(400)
  })

  it('POST /v1/admin/sources rejects unsupported type', async () => {
    const { app, cookie, csrfToken } = await loggedIn()
    const fd = new FormData()
    fd.append('name', 'd')
    fd.append('type', 'docx')
    fd.append('file', new Blob(['x']), 'd.docx')
    const res = await app.request('/v1/admin/sources', {
      method: 'POST', headers: { cookie, 'X-CSRF-Token': csrfToken }, body: fd,
    })
    expect(res.status).toBe(415)
  })

  it('GET /v1/admin/sources/:id returns a seeded source', async () => {
    const { app, container, cookie } = await loggedIn()
    const src = await container.knowledgeStore.createSource({ name: 'test', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'r' } })
    if (!src.ok) throw new Error('seed failed')
    const res = await app.request(`/v1/admin/sources/${src.value.id}`, { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string; name: string }
    expect(body.id).toBe(src.value.id)
    expect(body.name).toBe('test')
  })

  it('PUT /v1/admin/sources/:id/active toggles', async () => {
    const { app, container, cookie, csrfToken } = await loggedIn()
    const src = await container.knowledgeStore.createSource({ name: 'd', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'r' } })
    if (!src.ok) throw new Error('seed')
    const res = await app.request(`/v1/admin/sources/${src.value.id}/active`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie, 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ active: false }),
    })
    expect(res.status).toBe(200)
    const reload = await container.knowledgeStore.getSource(src.value.id)
    expect(reload.ok && !reload.value.active).toBe(true)
  })

  it('DELETE /v1/admin/sources/:id removes source', async () => {
    const { app, container, cookie, csrfToken } = await loggedIn()
    const src = await container.knowledgeStore.createSource({ name: 'del', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'r' } })
    if (!src.ok) throw new Error('seed')
    const res = await app.request(`/v1/admin/sources/${src.value.id}`, {
      method: 'DELETE', headers: { cookie, 'X-CSRF-Token': csrfToken },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('GET /v1/admin/sources/:id/preview returns chunks', async () => {
    const { app, container, cookie } = await loggedIn()
    const src = await container.knowledgeStore.createSource({ name: 'prev', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'r' } })
    if (!src.ok) throw new Error('seed')
    const res = await app.request(`/v1/admin/sources/${src.value.id}/preview?n=3`, { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json() as { chunks: unknown[] }
    expect(Array.isArray(body.chunks)).toBe(true)
  })

  it('POST /v1/admin/sources/:id/reindex returns ok', async () => {
    const { app, container, cookie, csrfToken } = await loggedIn()
    const src = await container.knowledgeStore.createSource({ name: 'ri', sourceType: 'txt', config: { sourceType: 'txt', fileRef: 'r' } })
    if (!src.ok) throw new Error('seed')
    const res = await app.request(`/v1/admin/sources/${src.value.id}/reindex`, {
      method: 'POST', headers: { cookie, 'X-CSRF-Token': csrfToken },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('rejects without cookie', async () => {
    const { app } = buildTestApp()
    const res = await app.request('/v1/admin/sources')
    expect(res.status).toBe(401)
  })
})
