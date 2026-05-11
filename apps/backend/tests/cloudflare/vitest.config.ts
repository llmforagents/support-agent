// Vitest config for Cloudflare Worker integration tests. Each test runs
// inside a real miniflare isolate with the D1 + R2 + DO bindings declared
// below reachable via `import { env } from 'cloudflare:test'`.
//
// NOTE — Two intentional drifts from the original P4 plan snippet:
//
//   1. `vectorizeIndexes` (from the plan snippet) is not a valid key in
//      either miniflare 3.x or 4.x. The 4.x equivalent is `vectorize`
//      with `{ VEC: { index_name } }`. We skip the binding entirely for
//      now — vitest-pool-workers 0.5.41 bundles miniflare 3.20241230.0,
//      which does not implement Vectorize at all. Re-add (under the right
//      key) once vitest-pool-workers ships a Vectorize-capable miniflare.
//
//   2. We deliberately do NOT pass `wrangler.configPath` here. Doing so
//      makes vitest-pool-workers run wrangler's `unstable_getMiniflareWorkerOptions`,
//      which pulls in the `[[vectorize]]` and durable-object bindings from
//      `apps/backend/wrangler.toml` and crashes workerd:
//        `wrapped binding module can't be resolved (internal modules only);
//         moduleName = miniflare-internal:wrapped:__WRANGLER_EXTERNAL_VECTORIZE_WORKERVEC`
//      Since the bindings we actually need for tests are small (DB, FILES,
//      HUB, HANDOFF_TIMER), we just declare them here.
//
// The `main` field points at `_doExports.ts`, a temporary entrypoint that
// re-exports both DO classes so miniflare can resolve the `className`
// strings in the `durableObjects` block. Section G replaces this with the
// real worker entrypoint (`apps/backend/src/worker.ts`).
import { fileURLToPath } from 'node:url'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

const doExportsPath = fileURLToPath(new URL('./_doExports.ts', import.meta.url))

export default defineWorkersConfig({
  test: {
    include: ['tests/cloudflare/**/*.test.ts'],
    poolOptions: {
      workers: {
        main: doExportsPath,
        // `isolatedStorage: false` + `singleWorker: true` together: we have
        // to turn off per-test storage isolation because vitest-pool-workers
        // 0.5.41's snapshot path iterates the DO persist directory and
        // asserts every file ends in `.sqlite` — but newer workerd defaults
        // DOs to SQLite-WAL mode, which emits `.sqlite-shm` / `.sqlite-wal`
        // sidecars and trips the assert the moment any test exercises a DO.
        // Disabling isolation alone would let parallel test files race on
        // the shared D1 binding (one file's `DELETE FROM sessions` wipes
        // another file's in-flight rows), so we serialize to a single
        // worker isolate.
        isolatedStorage: false,
        singleWorker: true,
        miniflare: {
          compatibilityDate: '2024-12-30',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          r2Buckets: ['FILES'],
          durableObjects: {
            HUB: 'BroadcastHubDurableObject',
            HANDOFF_TIMER: 'HandoffTimeoutDurableObject',
          },
        },
      },
    },
  },
})
