// Vitest config for Cloudflare Worker integration tests. Runs each test
// inside a real miniflare isolate with D1 + R2 + Vectorize bindings sourced
// from `apps/backend/wrangler.toml`. The bindings (DB, FILES, VEC) are
// reachable via `import { env } from 'cloudflare:test'`.
//
// NOTE — Two intentional drifts from the original P4 plan snippet:
//   1. `durableObjects` is omitted. The DO classes
//      (BroadcastHubDurableObject, HandoffTimeoutDurableObject) are not
//      defined yet (Sections F/G add them). Re-add this block in F1 once
//      the classes exist, otherwise miniflare fails to start the runner.
//   2. `vectorizeIndexes` (from the plan snippet) is not accepted by
//      miniflare 4.x — the actual key is `vectorize` with shape
//      `{ VEC: { index_name } }`. The binding is already declared via
//      `[[vectorize]]` in wrangler.toml, so we let
//      `unstable_getMiniflareWorkerOptions` pick it up from there rather
//      than re-declaring it here.
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: '../../wrangler.toml' },
        miniflare: {
          d1Databases: ['DB'],
          r2Buckets: ['FILES'],
        },
      },
    },
  },
})
