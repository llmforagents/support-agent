import { describe, it, expect } from 'vitest'
import { loadEnv } from './env'

const VALID = {
  NODE_ENV: 'development',
  PORT: '3001',
  PUBLIC_API_URL: 'http://localhost:3001',
  ADMIN_ORIGIN: 'http://localhost:3000',
  STORAGE_DRIVER: 'postgres',
  POSTGRES_URL: 'postgres://u:p@localhost:5432/db',
  ENCRYPTION_KEY: 'a'.repeat(64),
  STREAM_TOKEN_SECRET: 'c'.repeat(64),
  COOKIE_SECRET: 'b'.repeat(32),
}

describe('loadEnv', () => {
  it('parses valid postgres env', () => {
    const env = loadEnv(VALID)
    expect(env.PORT).toBe(3001)
    expect(env.STORAGE_DRIVER).toBe('postgres')
  })

  it('throws when ENCRYPTION_KEY is wrong length', () => {
    expect(() => loadEnv({ ...VALID, ENCRYPTION_KEY: 'short' })).toThrow(/ENCRYPTION_KEY/)
  })

  it('requires POSTGRES_URL when STORAGE_DRIVER=postgres', () => {
    const { POSTGRES_URL: _, ...rest } = VALID
    expect(() => loadEnv(rest)).toThrow(/POSTGRES_URL/)
  })

  it('defaults LLM4AGENTS_API_BASE', () => {
    expect(loadEnv(VALID).LLM4AGENTS_API_BASE).toBe('https://api.llm4agents.com')
  })

  it('coerces booleans/numbers', () => {
    const env = loadEnv({ ...VALID, METRICS_ENABLED: 'true', PORT: '8080' })
    expect(env.METRICS_ENABLED).toBe(true)
    expect(env.PORT).toBe(8080)
  })

  it('defaults STORAGE_DRIVER to postgres', () => {
    const { STORAGE_DRIVER: _omit, ...rest } = VALID
    const env = loadEnv(rest)
    expect(env.STORAGE_DRIVER).toBe('postgres')
  })

  it('accepts STORAGE_DRIVER=cloudflare when all CF_* bindings are present', () => {
    const env = loadEnv({
      ...VALID,
      STORAGE_DRIVER: 'cloudflare',
      CF_D1_BINDING: 'DB',
      CF_VECTORIZE_BINDING: 'VEC',
      CF_R2_BINDING: 'FILES',
      CF_DURABLE_OBJECT_BINDING: 'HUB',
    })
    expect(env.STORAGE_DRIVER).toBe('cloudflare')
    expect(env.CF_D1_BINDING).toBe('DB')
  })

  it('rejects STORAGE_DRIVER=cloudflare with missing CF_R2_BINDING', () => {
    expect(() =>
      loadEnv({
        ...VALID,
        STORAGE_DRIVER: 'cloudflare',
        CF_D1_BINDING: 'DB',
        CF_VECTORIZE_BINDING: 'VEC',
        CF_DURABLE_OBJECT_BINDING: 'HUB',
      }),
    ).toThrow(/CF_R2_BINDING/)
  })

  it('rejects STORAGE_DRIVER=postgres without POSTGRES_URL', () => {
    const { POSTGRES_URL: _omit, ...rest } = VALID
    expect(() => loadEnv(rest)).toThrow(/POSTGRES_URL/)
  })
})
