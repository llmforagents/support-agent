import { encode } from 'gpt-tokenizer'
import { Ok, Err, type Result, type IngestError } from '@support/shared'
import type { RawChunk } from '../../domain/source'
import { validateSelectQuery } from './sqlSafety'

export type MysqlCredentials = Readonly<{
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
}>

export type MysqlQueryConfig = Readonly<{
  query: string
  rowTemplate: string
  timeoutMs?: number
}>

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Renders a row object into text using a Mustache-style {{field}} template.
 * Unknown fields are replaced with empty string.
 */
function renderRow(template: string, row: Readonly<Record<string, unknown>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const val = row[key]
    return val !== undefined && val !== null ? String(val) : ''
  })
}

export async function parseMysql(
  creds: MysqlCredentials,
  config: MysqlQueryConfig,
): Promise<Result<readonly RawChunk[], IngestError>> {
  // 1. Validate query safety first
  const safetyResult = validateSelectQuery(config.query)
  if (!safetyResult.ok) return safetyResult

  const { safeSql } = safetyResult.value
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

  // 2. Connect and execute
  let conn: { execute(sql: string): Promise<[unknown, unknown]>; end(): Promise<void> } | undefined
  try {
    const { default: mysql } = await import('mysql2/promise')

    const sslOption = creds.ssl ? ({} as Record<string, never>) : undefined

    const connectionConfig = creds.ssl
      ? { host: creds.host, port: creds.port, database: creds.database, user: creds.user, password: creds.password, connectTimeout: timeoutMs, ssl: sslOption }
      : { host: creds.host, port: creds.port, database: creds.database, user: creds.user, password: creds.password, connectTimeout: timeoutMs }

    const connectPromise = mysql.createConnection(connectionConfig as Parameters<typeof mysql.createConnection>[0])

    const timeoutError = new DOMException('connect timeout', 'TimeoutError')
    const timerPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(timeoutError), timeoutMs),
    )

    try {
      conn = await Promise.race([connectPromise, timerPromise])
    } catch (err) {
      const msg = String(err)
      if (msg.includes('TimeoutError') || msg.includes('ETIMEDOUT') || msg.includes('connect timeout')) {
        return Err({ kind: 'mysql_query_timeout', timeoutMs })
      }
      if (msg.includes('ECONNREFUSED') || msg.includes('connection refused')) {
        return Err({ kind: 'mysql_connection_refused', host: creds.host })
      }
      return Err({ kind: 'mysql_connection_refused', host: creds.host })
    }

    // 3. Execute query with timeout
    let rows: unknown[]
    try {
      const executePromise = conn.execute(safeSql)
      const queryTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new DOMException('query timeout', 'TimeoutError')), timeoutMs),
      )
      const [result] = await Promise.race([executePromise, queryTimeout]) as [unknown[], unknown]
      rows = result
    } catch (err) {
      const msg = String(err)
      if (msg.includes('TimeoutError') || msg.includes('ETIMEDOUT') || msg.includes('query timeout')) {
        return Err({ kind: 'mysql_query_timeout', timeoutMs })
      }
      return Err({ kind: 'mysql_connection_refused', host: creds.host })
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return Ok([])
    }

    // 4. Render each row into a chunk
    const chunks: RawChunk[] = rows.map((row, index) => {
      const rowObj = row as Record<string, unknown>
      const text = renderRow(config.rowTemplate, rowObj)
      const tokens = encode(text)
      return {
        text,
        tokenCount: tokens.length,
        metadata: { rowIndex: index, source: 'mysql_query' },
      }
    })

    return Ok(chunks.filter((c) => c.text.trim().length > 0))
  } finally {
    if (conn) {
      await conn.end().catch(() => undefined)
    }
  }
}
