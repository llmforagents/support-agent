import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll } from 'vitest'
import { createPool, type PgPool } from '../../src/infrastructure/adapters/postgres/pool'
import { runMigrations } from '../../src/infrastructure/adapters/postgres/runMigrations'

export type PgFixture = { pool: PgPool; connectionString: string }

export function usePostgres(): PgFixture {
  let container: StartedPostgreSqlContainer
  const fix: PgFixture = { pool: null as never, connectionString: '' }
  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start()
    fix.connectionString = container.getConnectionUri()
    fix.pool = createPool(fix.connectionString)
    await runMigrations(fix.pool)
  }, 60_000)
  afterAll(async () => {
    await fix.pool?.end()
    await container?.stop()
  })
  return fix
}
