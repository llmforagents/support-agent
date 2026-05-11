import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.integration.test.ts', 'tests/**/*.test.ts'],
    // tests/cloudflare/ runs under its own pool (vitest-pool-workers); the
    // default node pool cannot resolve the `cloudflare:test` import.
    exclude: ['node_modules/**', 'dist/**', 'dist-cf/**', 'tests/cloudflare/**'],
    testTimeout: 30_000,
    hookTimeout: 90_000,
  },
})
