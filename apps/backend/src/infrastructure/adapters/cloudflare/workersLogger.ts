// WorkersLogger — a pino-compatible structured logger for the Cloudflare
// Workers runtime, where pino itself doesn't run cleanly (no pino-pretty
// transport, no worker_threads). Emits one JSON line per log call to
// `console.log` (or `console.error` for `error` level), respecting the
// LOG_LEVEL filter passed to the constructor.
//
// Implements the structural `Logger` interface so both pino and this class
// are interchangeable in the Container's `logger` field. `child(bindings)`
// returns a new WorkersLogger that merges the bindings into every payload.
import type { Logger } from '../../observability/logger'

const LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type WorkersLogLevel = (typeof LEVELS)[number]

export class WorkersLogger implements Logger {
  private readonly minIdx: number

  constructor(
    level: WorkersLogLevel,
    private readonly bindings: Readonly<Record<string, unknown>> = {},
  ) {
    this.minIdx = LEVELS.indexOf(level)
  }

  private emit(level: WorkersLogLevel, objOrMsg: object | string, maybeMsg?: string): void {
    if (LEVELS.indexOf(level) < this.minIdx) return
    const time = new Date().toISOString()
    const payload =
      typeof objOrMsg === 'string'
        ? { level, ...this.bindings, msg: objOrMsg, time }
        : { level, ...this.bindings, ...(objOrMsg as Record<string, unknown>), msg: maybeMsg ?? '', time }
    const line = JSON.stringify(payload)
    if (level === 'error') console.error(line)
    else console.log(line)
  }

  debug(obj: object, msg?: string): void
  debug(msg: string): void
  debug(arg1: object | string, arg2?: string): void {
    this.emit('debug', arg1, arg2)
  }

  info(obj: object, msg?: string): void
  info(msg: string): void
  info(arg1: object | string, arg2?: string): void {
    this.emit('info', arg1, arg2)
  }

  warn(obj: object, msg?: string): void
  warn(msg: string): void
  warn(arg1: object | string, arg2?: string): void {
    this.emit('warn', arg1, arg2)
  }

  error(obj: object, msg?: string): void
  error(msg: string): void
  error(arg1: object | string, arg2?: string): void {
    this.emit('error', arg1, arg2)
  }

  child(bindings: Record<string, unknown>): Logger {
    // Reconstruct level from minIdx — bounds-checked by construction.
    const level = LEVELS[this.minIdx] ?? 'info'
    return new WorkersLogger(level, { ...this.bindings, ...bindings })
  }
}
