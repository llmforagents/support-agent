// Composition root for the Cloudflare Workers deployment.
//
// Wires the D1 / Vectorize / R2 / Durable Object adapters built in P4 sections
// B–G1 into the same `Container` shape consumed by the Hono app
// (`createApp`). The Postgres compose lives in `composeContainerPostgres.ts`
// — keep both in lockstep field-for-field so route handlers cannot tell the
// driver apart.
//
// Two intentional substitutions for the Workers runtime:
//   * `bcrypt` (native addon, not bundleable) → `bcryptjs` (pure JS,
//     compatible `$2a$` hash format) via `cloudflarePasswordHash.ts`.
//   * Node's `setInterval`-based `HandoffTimeoutScheduler` →
//     `HandoffTimeoutDurableObject` (alarm-driven). The handle returned by
//     `bootHandoffTimer` only exposes `start()`/`stop()`; it kicks the DO
//     alarm on boot (idempotent — DO ignores if already armed) and is a
//     no-op on `stop()` since the alarm self-perpetuates regardless of
//     isolate lifetime.
import { createHash } from 'node:crypto'
import type { Env } from '@support/shared'
import type { Container } from './container'
import { D1AdminStore } from '../infrastructure/adapters/cloudflare/d1AdminStore'
import { D1AdminSessionStore } from '../infrastructure/adapters/cloudflare/d1AdminSessionStore'
import { D1SessionStore } from '../infrastructure/adapters/cloudflare/d1SessionStore'
import { D1SiteConfigStore } from '../infrastructure/adapters/cloudflare/d1SiteConfigStore'
import { D1KnowledgeStore } from '../infrastructure/adapters/cloudflare/d1KnowledgeStore'
import { D1MysqlConnectionStore } from '../infrastructure/adapters/cloudflare/d1MysqlConnectionStore'
import { VectorizeStore } from '../infrastructure/adapters/cloudflare/vectorizeStore'
import { R2FileStore } from '../infrastructure/adapters/cloudflare/r2FileStore'
import { DurableObjectBroadcast } from '../infrastructure/adapters/cloudflare/durableObjectBroadcast'
import { WorkersLogger, type WorkersLogLevel } from '../infrastructure/adapters/cloudflare/workersLogger'
import { runD1Migrations } from '../infrastructure/adapters/cloudflare/d1Migrations'
import {
  hashPasswordCloudflare,
  verifyPasswordCloudflare,
} from '../infrastructure/adapters/cloudflare/cloudflarePasswordHash'
import { Llm4AgentsLlmAdapter } from '../infrastructure/adapters/llm4agents/llmAdapter'
import { Llm4AgentsEmbedderAdapter } from '../infrastructure/adapters/llm4agents/embedderAdapter'
import { encrypt as rawEncrypt, decrypt as rawDecrypt } from '../infrastructure/crypto/encryption'
import type { HandoffTimeoutSchedulerHandle } from '../infrastructure/sse/handoffTimeoutScheduler'
import { AnalyticsEngineMetrics } from '../infrastructure/observability/metricsCloudflare'
import { noopMetrics, type MetricsPort } from '../infrastructure/observability/metrics'

export type WorkerBindings = Readonly<{
  DB: D1Database
  VEC: VectorizeIndex
  FILES: R2Bucket
  HUB: DurableObjectNamespace
  HANDOFF_TIMER: DurableObjectNamespace
  // Optional Analytics Engine dataset binding (declared in wrangler.toml
  // under `[[analytics_engine_datasets]]`). When absent — local `wrangler
  // dev` without the binding, vitest-pool-workers, etc. — the composition
  // wires `noopMetrics` so metric emits become no-ops.
  METRICS?: AnalyticsEngineDataset
}>

async function pingLlm(apiBase: string): Promise<boolean> {
  try {
    const r = await fetch(`${apiBase}/healthz`, { signal: AbortSignal.timeout(3_000) })
    return r.ok
  } catch {
    return false
  }
}

async function pingD1(db: D1Database): Promise<boolean> {
  try {
    const r = await db.prepare('SELECT 1 AS ok').first<{ ok: number }>()
    return r?.ok === 1
  } catch {
    return false
  }
}

function bootHandoffTimer(ns: DurableObjectNamespace): HandoffTimeoutSchedulerHandle {
  let started = false
  return {
    start(): void {
      if (started) return
      started = true
      const stub = ns.get(ns.idFromName('singleton'))
      // Fire-and-forget — the DO arms its own alarm idempotently.
      void stub.fetch('http://hub/start', { method: 'POST' }).catch(() => undefined)
    },
    stop(): void {
      // No-op: the alarm self-perpetuates inside the DO regardless of
      // worker isolate lifetime. There is no equivalent of `clearInterval`
      // on the Workers side.
    },
  }
}

export async function composeContainerCloudflare(
  env: Env,
  bindings: WorkerBindings,
): Promise<Container> {
  if (env.STORAGE_DRIVER !== 'cloudflare') {
    throw new Error(
      `STORAGE_DRIVER=${env.STORAGE_DRIVER} not supported by composeContainerCloudflare — cloudflare only`,
    )
  }

  const logger = new WorkersLogger(env.LOG_LEVEL as WorkersLogLevel)
  await runD1Migrations(bindings.DB)

  const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')
  const encrypt = (plaintext: string): Promise<string> => rawEncrypt(plaintext, env.ENCRYPTION_KEY)
  const decrypt = (envelope: string): Promise<string> => rawDecrypt(envelope, env.ENCRYPTION_KEY)

  const broadcast = new DurableObjectBroadcast(bindings.HUB)
  const handoffTimeoutScheduler = bootHandoffTimer(bindings.HANDOFF_TIMER)
  handoffTimeoutScheduler.start()
  const metrics: MetricsPort = bindings.METRICS
    ? new AnalyticsEngineMetrics(bindings.METRICS)
    : noopMetrics

  return {
    driver: 'cloudflare' as const,
    env,
    adminStore: new D1AdminStore(bindings.DB),
    adminSessionStore: new D1AdminSessionStore(bindings.DB),
    siteConfigStore: new D1SiteConfigStore(bindings.DB),
    sessionStore: new D1SessionStore(bindings.DB),
    broadcast,
    llm: new Llm4AgentsLlmAdapter(undefined, env.LLM4AGENTS_API_BASE),
    knowledgeStore: new D1KnowledgeStore(bindings.DB),
    vectorStore: new VectorizeStore(bindings.VEC, bindings.DB),
    fileStore: new R2FileStore(bindings.FILES),
    embedder: new Llm4AgentsEmbedderAdapter('openai/text-embedding-3-small', 1536, env.LLM4AGENTS_API_BASE),
    mysqlConnectionStore: new D1MysqlConnectionStore(bindings.DB, encrypt, decrypt),
    handoffTimeoutScheduler,
    sha256,
    encrypt,
    decrypt,
    hashPassword: hashPasswordCloudflare,
    verifyPassword: verifyPasswordCloudflare,
    logger,
    metrics,
    healthChecks: {
      db: () => pingD1(bindings.DB),
      llm: () => pingLlm(env.LLM4AGENTS_API_BASE),
    },
    shutdown: () => Promise.resolve(),
  }
}
