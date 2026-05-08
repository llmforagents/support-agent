import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PgPool } from './pool'
import type { Logger } from '../../observability/logger'

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../../migrations/', import.meta.url))
const ADVISORY_LOCK_KEY = 4242_4242

export async function runMigrations(pool: PgPool, logger?: Logger): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY])
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `)
      const applied = new Set(
        (await client.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version),
      )
      const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
      for (const file of files) {
        const version = file.replace(/\.sql$/, '')
        if (applied.has(version)) continue
        const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
        await client.query('BEGIN')
        try {
          await client.query(sql)
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version])
          await client.query('COMMIT')
          logger?.info({ version }, 'migration applied')
        } catch (err) {
          await client.query('ROLLBACK')
          throw err
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
    }
  } finally {
    client.release()
  }
}
