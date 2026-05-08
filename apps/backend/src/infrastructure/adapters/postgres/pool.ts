import pg from 'pg'

export type PgPool = pg.Pool

export function createPool(connectionString: string): PgPool {
  return new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
}

export async function pingPool(pool: PgPool): Promise<boolean> {
  try {
    const r = await pool.query('SELECT 1 AS ok')
    return r.rows[0]?.['ok'] === 1
  } catch {
    return false
  }
}
