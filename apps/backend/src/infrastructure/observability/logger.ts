import pino from 'pino'
import type { Env } from '@support/shared'

/**
 * Structural Logger interface implemented by both the Node-side pino logger
 * (Postgres compose) and the Workers-side WorkersLogger (Cloudflare compose).
 *
 * Methods accept either `(msg)` or `(obj, msg)` to match pino's call shape.
 * `child(bindings)` returns a sub-logger that mixes the given bindings into
 * every subsequent log line — pino implements this natively, WorkersLogger
 * implements it by merging into the emitted payload.
 */
export interface Logger {
  debug(obj: object, msg?: string): void
  debug(msg: string): void
  info(obj: object, msg?: string): void
  info(msg: string): void
  warn(obj: object, msg?: string): void
  warn(msg: string): void
  error(obj: object, msg?: string): void
  error(msg: string): void
  child(bindings: Record<string, unknown>): Logger
}

export function createLogger(env: Env): Logger {
  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-csrf-token"]',
        '*.passwordHash',
        '*.password',
        '*.llm4agentsApiKey',
        '*.llm4agentsApiKeyEncrypted',
        '*.tokenHash',
        '*.token',
        '*.streamToken',
        '*.encryptionKey',
      ],
      censor: '[REDACTED]',
    },
    ...(env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', colorize: true } } }
      : {}),
  })
}
