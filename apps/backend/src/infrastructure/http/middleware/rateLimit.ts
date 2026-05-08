import type { Context, MiddlewareHandler } from 'hono'

export type RateLimitOpts = Readonly<{
  windowMs: number
  max: number
  key: (c: Context) => string
}>

export function rateLimit(opts: RateLimitOpts): MiddlewareHandler {
  const buckets = new Map<string, number[]>()
  return async (c, next) => {
    const k = opts.key(c)
    const now = Date.now()
    const cutoff = now - opts.windowMs
    const existing = buckets.get(k) ?? []
    const arr = existing.filter((t) => t >= cutoff)
    if (arr.length >= opts.max) {
      const oldest = arr[0] ?? now
      const retryAfterSec = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000))
      c.header('Retry-After', String(retryAfterSec))
      return c.json({ error: 'rate_limited', kind: 'rate_limit_exceeded', detail: { retryAfterSec } }, 429)
    }
    arr.push(now)
    buckets.set(k, arr)
    return next()
  }
}
