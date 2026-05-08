import { z } from 'zod'

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'staging', 'production']),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    PUBLIC_API_URL: z.string().url(),
    ADMIN_ORIGIN: z.string().url(),
    LLM4AGENTS_API_BASE: z.string().url().default('https://api.llm4agents.com'),
    STORAGE_DRIVER: z.enum(['postgres', 'cloudflare']).default('postgres'),
    POSTGRES_URL: z.string().url().optional(),
    FILE_STORE_PATH: z.string().default('./data/files'),
    ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-f]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars'),
    STREAM_TOKEN_SECRET: z
      .string()
      .regex(/^[0-9a-f]{64}$/, 'STREAM_TOKEN_SECRET must be 64 hex chars'),
    COOKIE_SECRET: z.string().min(32),
    COOKIE_SECURE: z.coerce.boolean().default(true),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    METRICS_ENABLED: z.coerce.boolean().default(false),
    MAX_BODY_BYTES: z.coerce.number().int().min(1024).default(64 * 1024),
    SSE_MAX_CONNECTIONS: z.coerce.number().int().min(1).default(2_000),
    SSE_MAX_LIFETIME_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .default(4 * 60 * 60 * 1000),
    CF_D1_BINDING: z.string().optional(),
    CF_VECTORIZE_BINDING: z.string().optional(),
    CF_R2_BINDING: z.string().optional(),
    CF_DURABLE_OBJECT_BINDING: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 'postgres' && !env.POSTGRES_URL) {
      ctx.addIssue({
        code: 'custom',
        message: 'POSTGRES_URL required when STORAGE_DRIVER=postgres',
        path: ['POSTGRES_URL'],
      })
    }
    if (env.STORAGE_DRIVER === 'cloudflare') {
      for (const key of [
        'CF_D1_BINDING',
        'CF_VECTORIZE_BINDING',
        'CF_R2_BINDING',
        'CF_DURABLE_OBJECT_BINDING',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            message: `${key} required when STORAGE_DRIVER=cloudflare`,
            path: [key],
          })
        }
      }
    }
  })

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(raw: Readonly<Record<string, string | undefined>>): Env {
  const result = EnvSchema.safeParse(raw)
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid environment:\n${lines.join('\n')}`)
  }
  return result.data
}
