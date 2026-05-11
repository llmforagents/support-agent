// D1 migration runner. Applies the .sql files in apps/backend/migrations-d1/
// in lexicographic order, tracking applied versions in `schema_migrations`.
// Idempotent: running twice is a no-op.
//
// Statements are split on `;\n` because D1's batch API does not accept
// multi-statement strings reliably (especially for CREATE INDEX / ALTER TABLE).
// Comments (`-- …`) at the start of a statement are tolerated by D1.
// `.sql` imports are bundled as text strings:
//   * wrangler (production deploy): esbuild's Text loader via `[[rules]]`
//     in `wrangler.toml` (path-only glob; doesn't tolerate `?raw` query).
//   * vitest-pool-workers (test:cf): vite's `assetsInclude: ['**/*.sql']`
//     in `tests/cloudflare/vitest.config.ts` makes plain `.sql` imports
//     resolve to a raw-text default export.
// The module declarations live in `./sql.d.ts`.
import migration0001 from '../../../../migrations-d1/0001_init.sql'
import migration0002 from '../../../../migrations-d1/0002_kb.sql'
import migration0003 from '../../../../migrations-d1/0003_handoff_mysql.sql'

type Migration = Readonly<{ version: string; sql: string }>

const MIGRATIONS: readonly Migration[] = [
  { version: '0001_init', sql: migration0001 },
  { version: '0002_kb', sql: migration0002 },
  { version: '0003_handoff_mysql', sql: migration0003 },
] as const

function splitStatements(sql: string): readonly string[] {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export async function runD1Migrations(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    )
    .run()
  await db.prepare('PRAGMA foreign_keys = ON').run()

  const applied = await db
    .prepare('SELECT version FROM schema_migrations')
    .all<{ version: string }>()
  const appliedSet = new Set(applied.results.map((r) => r.version))

  for (const m of MIGRATIONS) {
    if (appliedSet.has(m.version)) continue
    const stmts = splitStatements(m.sql)
    const batch = stmts.map((sql) => db.prepare(sql))
    batch.push(db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').bind(m.version))
    await db.batch(batch)
  }
}
