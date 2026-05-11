// Cloudflare Workers entrypoint.
//
// Wrangler's `main` field in wrangler.toml points at this file. The default
// fetch handler composes the Container once per isolate (lazy on the first
// request) and delegates to the shared Hono app produced by `createApp`.
//
// Re-exports the two Durable Object classes by their exact `class_name`
// values from wrangler.toml — wrangler validates that DO bindings resolve
// from the entrypoint module, and miniflare (vitest-pool-workers) walks the
// same module to register DO namespaces. Removing these re-exports breaks
// both `wrangler deploy` and `vitest run --config tests/cloudflare/...`.
//
// Composition is cached on the module-scoped `cached` variable. Wrangler
// recycles isolates aggressively; on a fresh isolate the next request falls
// through to a re-compose, which is safe because `runD1Migrations` is
// idempotent and the DO `start` kick is a no-op once the alarm is armed.
import { loadEnv } from '@support/shared'
import { createApp } from './infrastructure/http/createApp'
import {
  composeContainerCloudflare,
  type WorkerBindings,
} from './composition/composeContainerCloudflare'

export { BroadcastHubDurableObject } from './infrastructure/adapters/cloudflare/broadcastHubDurableObject'
export { HandoffTimeoutDurableObject } from './infrastructure/adapters/cloudflare/handoffTimeoutDurableObject'

// The runtime `env` object combines Worker bindings (DB, VEC, ...) with the
// `[vars]` block from wrangler.toml (NODE_ENV, LOG_LEVEL, ...). `loadEnv`
// validates the latter via Zod; the bindings are passed through unchanged
// to `composeContainerCloudflare`.
type WorkerEnv = WorkerBindings & Record<string, string | undefined>

type CachedApp = Readonly<{ fetch: ReturnType<typeof createApp>['fetch'] }>

let cached: CachedApp | null = null

async function getApp(env: WorkerEnv): Promise<CachedApp> {
  if (cached) return cached
  const parsed = loadEnv(env)
  const container = await composeContainerCloudflare(parsed, env)
  const app = createApp(container)
  cached = { fetch: app.fetch }
  return cached
}

export default {
  async fetch(req: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const app = await getApp(env)
    return app.fetch(req, env, ctx)
  },
} satisfies ExportedHandler<WorkerEnv>
