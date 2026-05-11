// H1 - Worker E2E: drive the whole request path through `SELF.fetch` against
// the actual `src/worker.ts` default fetch handler. This validates that:
//   * `loadEnv(env)` accepts the `bindings` block from
//     `tests/cloudflare/vitest.config.ts` (STORAGE_DRIVER=cloudflare branch).
//   * `composeContainerCloudflare` wires D1/R2/DO bindings into the
//     `Container` shape consumed by `createApp`.
//   * `runD1Migrations` initialises the schema on the first request.
//   * `createApp` routes flow end-to-end: admin bootstrap, login, CSRF
//     dance, onboarding upsert, widget session create, visitor message,
//     and assistant reply persisted by the SDK-backed LLM adapter.
//
// Upstream LLM4Agents SDK HTTP calls are stubbed via `fetchMock`. The chat
// SSE stream uses OpenAI-style `data: {...}` frames because the SDK's
// `conv.stream()` adapter reads `delta.content` (see node_modules/
// @llmforagents/sdk/dist/index.js, conv.stream / parseSSE paths).
//
// VEC binding is intentionally absent - miniflare 3.x has no Vectorize. The
// `VectorizeStore.search` try/catch turns the undefined-property crash into
// an `Err({ kind: 'infra_db_error' })`, which `handleVisitorMessage` treats
// as no rag hits. The empty-knowledge-base happy path doesn't need
// Vectorize.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { env, fetchMock, SELF } from 'cloudflare:test'
import { runD1Migrations } from '../../src/infrastructure/adapters/cloudflare/d1Migrations'

const SSE_BODY =
  'data: {"choices":[{"delta":{"content":"hi"},"index":0}],"usage":null}\n\n' +
  'data: {"choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\n' +
  'data: [DONE]\n\n'

const EMBEDDING_BODY = {
  data: [{ embedding: Array.from({ length: 1536 }, () => 0), index: 0, object: 'embedding' }],
  model: 'openai/text-embedding-3-small',
  object: 'list',
  usage: { prompt_tokens: 1, total_tokens: 1 },
}

describe('worker E2E @integration', () => {
  beforeEach(async () => {
    await runD1Migrations(env.DB)
    // The CF tests share storage across the file (isolatedStorage:false), so
    // wipe admin + onboarding state from any prior describe to keep the
    // bootstrap step deterministic.
    await env.DB.prepare('DELETE FROM admin_sessions').run()
    await env.DB.prepare('DELETE FROM admins').run()
    await env.DB.prepare('DELETE FROM messages').run()
    await env.DB.prepare('DELETE FROM sessions').run()
    await env.DB.prepare('DELETE FROM site_config').run()
    fetchMock.activate()
    fetchMock.disableNetConnect()
  })
  afterEach(() => {
    fetchMock.assertNoPendingInterceptors()
    fetchMock.deactivate()
  })

  it('onboarding -> create session -> send message -> assistant reply persisted', async () => {
    // The embedder fires once per visitor message (RAG query embed), and
    // the chat-completions endpoint fires once for the assistant stream.
    // VectorizeStore.search crashes safely (returns Err) on the undefined
    // VEC binding, so embedder *is* called but its result is discarded.
    fetchMock
      .get('https://api.llm4agents.com')
      .intercept({ path: '/v1/embeddings', method: 'POST' })
      .reply(200, EMBEDDING_BODY, { headers: { 'content-type': 'application/json' } })
    fetchMock
      .get('https://api.llm4agents.com')
      .intercept({ path: '/v1/chat/completions', method: 'POST' })
      .reply(200, SSE_BODY, { headers: { 'content-type': 'text/event-stream' } })

    // 1) Bootstrap the first admin via the public onboarding route.
    const bootstrapRes = await SELF.fetch('http://localhost/v1/admin/auth/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'correct horse battery' }),
    })
    expect(bootstrapRes.status).toBe(200)

    // 2) Log in to obtain the session cookie.
    const loginRes = await SELF.fetch('http://localhost/v1/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'correct horse battery' }),
    })
    expect(loginRes.status).toBe(200)
    const sessionCookie = loginRes.headers.get('Set-Cookie')?.split(';')[0] ?? ''
    expect(sessionCookie).toContain('session=')

    // 3) Trigger the CSRF middleware on /v1/admin/onboarding/* with any
    //    request - the middleware always sets the cookie on the response.
    const csrfRes = await SELF.fetch('http://localhost/v1/admin/onboarding/complete', {
      method: 'GET',
      headers: { cookie: sessionCookie },
    })
    const csrfSet = csrfRes.headers.get('Set-Cookie') ?? ''
    const csrfMatch = /csrf=([0-9a-f]+)/.exec(csrfSet)
    const csrfToken = csrfMatch?.[1] ?? ''
    expect(csrfToken).toMatch(/^[0-9a-f]+$/)
    const cookies = `${sessionCookie}; csrf=${csrfToken}`

    // 4) Complete onboarding (encrypts and stores the llm4agents API key,
    //    sets siteName / systemPrompt that visitor messages flow through).
    const onbRes = await SELF.fetch('http://localhost/v1/admin/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookies, 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({
        siteName: 'Acme',
        primaryColor: '#000000',
        llm4agentsApiKey: 'sk-proxy-test-1234',
        agentModel: 'openai/gpt-4o-mini',
        systemPrompt: 'You are a helpful support assistant.',
      }),
    })
    expect(onbRes.status).toBe(200)

    // 5) Create a widget session.
    const visitorId = '11111111-2222-3333-4444-555555555555'
    const sessRes = await SELF.fetch('http://localhost/v1/widget/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId },
      body: '{}',
    })
    expect(sessRes.status).toBe(200)
    const { sessionId } = (await sessRes.json()) as { sessionId: string }
    expect(sessionId).toMatch(/^[0-9a-f-]+$/)

    // 6) Send a visitor message - triggers RAG embed + LLM stream + persist.
    const sendRes = await SELF.fetch(
      `http://localhost/v1/widget/sessions/${sessionId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId },
        body: JSON.stringify({ content: 'hello support' }),
      },
    )
    expect(sendRes.status).toBe(200)

    // 7) Assert: both visitor and assistant messages persisted.
    const rows = await env.DB.prepare(
      `SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC`,
    )
      .bind(sessionId)
      .all<{ role: string; content: string }>()
    expect(rows.results.length).toBe(2)
    expect(rows.results[0]?.role).toBe('visitor')
    expect(rows.results[0]?.content).toBe('hello support')
    expect(rows.results[1]?.role).toBe('assistant')
    expect(rows.results[1]?.content).toBe('hi')
  })
})
