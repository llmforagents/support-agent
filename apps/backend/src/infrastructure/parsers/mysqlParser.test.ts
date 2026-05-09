import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MysqlCredentials } from './mysqlParser'

const creds: MysqlCredentials = {
  host: 'localhost',
  port: 3306,
  database: 'testdb',
  user: 'root',
  password: 'password',
  ssl: false,
}

// We mock mysql2/promise at the module level so parseMysql uses our stub.
vi.mock('mysql2/promise', () => {
  return {
    default: {
      createConnection: vi.fn(),
    },
  }
})

describe('parseMysql', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns chunks rendered with rowTemplate for each row', async () => {
    const { default: mysql } = await import('mysql2/promise')
    const mockConn = {
      execute: vi.fn().mockResolvedValue([[
        { question: 'Q1', answer: 'A1' },
        { question: 'Q2', answer: 'A2' },
      ], null]),
      end: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(mysql.createConnection).mockResolvedValue(mockConn as never)

    const { parseMysql } = await import('./mysqlParser')
    const r = await parseMysql(creds, {
      query: 'SELECT * FROM faq',
      rowTemplate: 'Q: {{question}}\nA: {{answer}}',
    })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.length).toBe(2)
    expect(r.value[0]?.text).toBe('Q: Q1\nA: A1')
    expect(r.value[1]?.text).toBe('Q: Q2\nA: A2')
    expect(mockConn.end).toHaveBeenCalled()
  })

  it('returns empty array for empty result set', async () => {
    const { default: mysql } = await import('mysql2/promise')
    const mockConn = {
      execute: vi.fn().mockResolvedValue([[], null]),
      end: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(mysql.createConnection).mockResolvedValue(mockConn as never)

    const { parseMysql } = await import('./mysqlParser')
    const r = await parseMysql(creds, {
      query: 'SELECT * FROM empty_table',
      rowTemplate: '{{col}}',
    })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.length).toBe(0)
  })

  it('rejects unsafe query (INSERT) before attempting connection', async () => {
    const { default: mysql } = await import('mysql2/promise')
    vi.mocked(mysql.createConnection).mockResolvedValue({ execute: vi.fn(), end: vi.fn() } as never)

    const { parseMysql } = await import('./mysqlParser')
    const r = await parseMysql(creds, {
      query: 'INSERT INTO users VALUES (1)',
      rowTemplate: '{{id}}',
    })

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('mysql_unsafe_query')
    // Connection should NOT have been created
    expect(vi.mocked(mysql.createConnection)).not.toHaveBeenCalled()
  })

  it('returns mysql_connection_refused when createConnection throws ECONNREFUSED', async () => {
    const { default: mysql } = await import('mysql2/promise')
    vi.mocked(mysql.createConnection).mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:3306'))

    const { parseMysql } = await import('./mysqlParser')
    const r = await parseMysql(creds, {
      query: 'SELECT * FROM t',
      rowTemplate: '{{x}}',
    })

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('mysql_connection_refused')
    if (r.error.kind !== 'mysql_connection_refused') return
    expect(r.error.host).toBe('localhost')
  })

  it('returns mysql_query_timeout when execute never resolves within timeoutMs', async () => {
    const { default: mysql } = await import('mysql2/promise')
    const mockConn = {
      // Simulate a slow query that takes longer than our tiny timeout
      execute: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5_000))),
      end: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(mysql.createConnection).mockResolvedValue(mockConn as never)

    const { parseMysql } = await import('./mysqlParser')
    const r = await parseMysql(creds, {
      query: 'SELECT * FROM slow_table',
      rowTemplate: '{{col}}',
      timeoutMs: 50, // 50ms timeout — execute takes 5s so this will race
    })

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('mysql_query_timeout')
    if (r.error.kind !== 'mysql_query_timeout') return
    expect(r.error.timeoutMs).toBe(50)
  }, 15_000)

  it('chunks have tokenCount > 0 for non-empty text', async () => {
    const { default: mysql } = await import('mysql2/promise')
    const mockConn = {
      execute: vi.fn().mockResolvedValue([[{ name: 'Alice', role: 'admin' }], null]),
      end: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(mysql.createConnection).mockResolvedValue(mockConn as never)

    const { parseMysql } = await import('./mysqlParser')
    const r = await parseMysql(creds, {
      query: 'SELECT * FROM users',
      rowTemplate: 'Name: {{name}}, Role: {{role}}',
    })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value[0]?.tokenCount).toBeGreaterThan(0)
    expect(r.value[0]?.text).toBe('Name: Alice, Role: admin')
  })
})
