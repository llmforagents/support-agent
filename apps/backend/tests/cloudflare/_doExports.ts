// Temporary worker entrypoint used ONLY by tests/cloudflare/vitest.config.ts
// to expose the DO classes to miniflare. Real worker entrypoint
// (`apps/backend/src/worker.ts`) lands in Section G and will subsume this.
//
// vitest-pool-workers requires `main` to point at a module that exports the
// Durable Object classes referenced in `miniflare.durableObjects` — without
// it, miniflare can't resolve the class names and the runner fails to start.
//
// The default-exported fetch handler is a placeholder so `import { SELF }`
// in tests doesn't blow up if anyone tries it; F2's adapter test stubs the
// DO directly via the binding instead.
export { BroadcastHubDurableObject } from '../../src/infrastructure/adapters/cloudflare/broadcastHubDurableObject'
export { HandoffTimeoutDurableObject } from '../../src/infrastructure/adapters/cloudflare/handoffTimeoutDurableObject'

export default {
  fetch(): Response {
    return new Response('not implemented', { status: 501 })
  },
}
