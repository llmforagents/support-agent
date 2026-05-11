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
// The `main` field points at the real worker entrypoint
// (`apps/backend/src/worker.ts`), which re-exports both Durable Object
// classes so miniflare can resolve the `className` strings in the
// `durableObjects` block. Section G4 subsumed the earlier `_doExports.ts`
// placeholder. Tests don't typically go through the worker fetch handler
// (they instantiate adapters directly via `env.DB`, `env.HUB`, etc.); the
// worker module only needs to load so miniflare can wire the DO namespaces.
import { fileURLToPath } from 'node:url'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

const workerEntry = fileURLToPath(new URL('../../src/worker.ts', import.meta.url))

// Vite plugin that loads `.sql` files as raw text strings. Mirrors the
// `[[rules]] type = "Text"` block in wrangler.toml so plain `.sql`
// imports work identically in tests and the production worker bundle.
// (Vite has a built-in `?raw` query, but wrangler's esbuild doesn't —
// so we standardise on bare `.sql` imports.)
const sqlAsText = {
  name: 'sql-as-text',
  transform(code: string, id: string): { code: string; map: null } | null {
    const path = id.split('?')[0] ?? id
    if (!path.endsWith('.sql')) return null
    return { code: `export default ${JSON.stringify(code)}`, map: null }
  },
}

export default defineWorkersConfig({
  plugins: [sqlAsText],
  test: {
    include: ['tests/cloudflare/**/*.test.ts'],
    poolOptions: {
      workers: {
        main: workerEntry,
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
          // Compatibility date sets the baseline behaviour of the workerd
          // runtime bundled with vitest-pool-workers (1.20241230 here).
          // The `nodejs_compat_v2` flag exposes the full node:crypto surface
          // (`createCipheriv`/`createDecipheriv` used by `encryption.ts`);
          // bare `nodejs_compat` only covers a subset, but is required as a
          // prerequisite by workerd (it errors out without it).
          compatibilityDate: '2024-12-30',
          compatibilityFlags: ['nodejs_compat', 'nodejs_compat_v2'],
          d1Databases: ['DB'],
          r2Buckets: ['FILES'],
          durableObjects: {
            HUB: 'BroadcastHubDurableObject',
            HANDOFF_TIMER: 'HandoffTimeoutDurableObject',
          },
          // Worker `[vars]` block — `loadEnv(env)` in `src/worker.ts` reads
          // these via Zod (`packages/shared/src/env.ts`) on the first request
          // through `SELF.fetch`. Adapter-only tests bypass `loadEnv` (they
          // touch `env.DB` directly), but the H1 worker E2E goes through the
          // full default fetch handler and needs every required var.
          bindings: {
            NODE_ENV: 'development',
            PORT: '3001',
            PUBLIC_API_URL: 'http://localhost:3001',
            ADMIN_ORIGIN: 'http://localhost:3000',
            LLM4AGENTS_API_BASE: 'https://api.llm4agents.com',
            STORAGE_DRIVER: 'cloudflare',
            FILE_STORE_PATH: './data/files',
            ENCRYPTION_KEY: 'a'.repeat(64),
            STREAM_TOKEN_SECRET: 'b'.repeat(64),
            COOKIE_SECRET: 'c'.repeat(32),
            COOKIE_SECURE: 'false',
            LOG_LEVEL: 'error',
            METRICS_ENABLED: 'false',
            MAX_BODY_BYTES: '65536',
            SSE_MAX_CONNECTIONS: '2000',
            SSE_MAX_LIFETIME_MS: '14400000',
            CF_D1_BINDING: 'DB',
            CF_VECTORIZE_BINDING: 'VEC',
            CF_R2_BINDING: 'FILES',
            CF_DURABLE_OBJECT_BINDING: 'HUB',
          },
        },
      },
    },
  },
})
