// Vitest config for Cloudflare Worker integration tests. Each test runs
// inside a real miniflare isolate with the D1 + R2 bindings declared below
// reachable via `import { env } from 'cloudflare:test'`.
//
// NOTE — Three intentional drifts from the original P4 plan snippet:
//
//   1. `durableObjects` is omitted. The DO classes
//      (BroadcastHubDurableObject, HandoffTimeoutDurableObject) are not
//      defined yet (Sections F/G add them). Re-add this block in F1 once
//      the classes exist, otherwise miniflare fails to start the runner.
//
//   2. `vectorizeIndexes` (from the plan snippet) is not a valid key in
//      either miniflare 3.x or 4.x. The 4.x equivalent is `vectorize`
//      with `{ VEC: { index_name } }`. We skip the binding entirely for
//      now — vitest-pool-workers 0.5.41 bundles miniflare 3.20241230.0,
//      which does not implement Vectorize at all. Re-add (under the right
//      key) once vitest-pool-workers ships a Vectorize-capable miniflare.
//
//   3. We deliberately do NOT pass `wrangler.configPath` here. Doing so
//      makes vitest-pool-workers run wrangler's `unstable_getMiniflareWorkerOptions`,
//      which pulls in the `[[vectorize]]` and durable-object bindings from
//      `apps/backend/wrangler.toml` and crashes workerd:
//        `wrapped binding module can't be resolved (internal modules only);
//         moduleName = miniflare-internal:wrapped:__WRANGLER_EXTERNAL_VECTORIZE_WORKERVEC`
//      Since the bindings we actually need for tests are small (DB, FILES),
//      we just declare them here.
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    include: ['tests/cloudflare/**/*.test.ts'],
    poolOptions: {
      workers: {
        miniflare: {
          compatibilityDate: '2024-12-30',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          r2Buckets: ['FILES'],
        },
      },
    },
  },
})
