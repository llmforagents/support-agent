import pino from 'pino'
import type { Env } from '@support/shared'

export type Logger = pino.Logger

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
