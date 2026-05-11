// Augments the `env` exported from `cloudflare:test` with the bindings
// declared in apps/backend/wrangler.toml + tests/cloudflare/vitest.config.ts.
// The triple-slash reference loads the ambient `declare module "cloudflare:test"`
// shipped by @cloudflare/vitest-pool-workers.
/// <reference types="@cloudflare/vitest-pool-workers" />

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database
    FILES: R2Bucket
    VEC: VectorizeIndex
  }
}
