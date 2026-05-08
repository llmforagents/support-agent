import type { AdminRow } from './application/ports'
import type { Logger } from './infrastructure/observability/logger'

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string
    logger: Logger
    admin: AdminRow
  }
}

export {}
