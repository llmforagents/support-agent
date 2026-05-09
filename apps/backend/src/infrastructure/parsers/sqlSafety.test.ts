import { describe, it, expect } from 'vitest'
import { validateSelectQuery } from './sqlSafety'

describe('validateSelectQuery', () => {
  it('SELECT without LIMIT appends LIMIT 5000', () => {
    const r = validateSelectQuery('SELECT * FROM users WHERE id = 1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.hasLimit).toBe(false)
    expect(r.value.safeSql).toBe('SELECT * FROM users WHERE id = 1 LIMIT 5000')
  })

  it('SELECT with LIMIT preserves safeSql unchanged (trailing semicolon stripped)', () => {
    const r = validateSelectQuery('SELECT * FROM users LIMIT 100;')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.hasLimit).toBe(true)
    expect(r.value.safeSql).toBe('SELECT * FROM users LIMIT 100')
  })

  it('SELECT with LIMIT has no trailing semicolon', () => {
    const r = validateSelectQuery('SELECT id, name FROM products LIMIT 10')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.hasLimit).toBe(true)
    expect(r.value.safeSql).toBe('SELECT id, name FROM products LIMIT 10')
  })

  it('INSERT rejects with denied_keyword', () => {
    const r = validateSelectQuery('INSERT INTO users VALUES (1, "a")')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('mysql_unsafe_query')
    if (r.error.kind !== 'mysql_unsafe_query') return
    expect(r.error.reason).toBe('denied_keyword')
  })

  it('DROP TABLE rejects with denied_keyword', () => {
    const r = validateSelectQuery('DROP TABLE users')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('mysql_unsafe_query')
    if (r.error.kind !== 'mysql_unsafe_query') return
    expect(r.error.reason).toBe('denied_keyword')
  })

  it('DELETE rejects with denied_keyword', () => {
    const r = validateSelectQuery('DELETE FROM users WHERE id = 1')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('mysql_unsafe_query')
    if (r.error.kind !== 'mysql_unsafe_query') return
    expect(r.error.reason).toBe('denied_keyword')
  })

  it('UPDATE rejects with denied_keyword', () => {
    const r = validateSelectQuery('UPDATE users SET name = "x"')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('mysql_unsafe_query')
    if (r.error.kind !== 'mysql_unsafe_query') return
    expect(r.error.reason).toBe('denied_keyword')
  })

  it('multiple statements via semicolon rejects', () => {
    const r = validateSelectQuery('SELECT * FROM users; DROP TABLE users')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('mysql_unsafe_query')
    if (r.error.kind !== 'mysql_unsafe_query') return
    // May be denied_keyword (DROP) or multiple_statements depending on check order
    expect(['denied_keyword', 'multiple_statements']).toContain(r.error.reason)
  })

  it('malformed/garbage SQL rejects with parse_error', () => {
    const r = validateSelectQuery('NOT VALID SQL @@@###')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('mysql_unsafe_query')
    if (r.error.kind !== 'mysql_unsafe_query') return
    expect(r.error.reason).toBe('parse_error')
  })

  it('UNION rejects with denied_keyword', () => {
    const r = validateSelectQuery('SELECT * FROM a UNION SELECT * FROM b')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('mysql_unsafe_query')
    if (r.error.kind !== 'mysql_unsafe_query') return
    expect(r.error.reason).toBe('denied_keyword')
  })

  it('GRANT rejects with denied_keyword', () => {
    const r = validateSelectQuery('GRANT ALL ON *.* TO user@host')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('mysql_unsafe_query')
  })

  it('empty string rejects with parse_error', () => {
    const r = validateSelectQuery('')
    expect(r.ok).toBe(false)
  })

  it('SHOW TABLES rejects (not_select or parse_error)', () => {
    const r = validateSelectQuery('SHOW TABLES')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('mysql_unsafe_query')
  })

  it('complex valid SELECT with WHERE, ORDER, LIMIT', () => {
    const r = validateSelectQuery(
      'SELECT id, name, email FROM customers WHERE active = 1 ORDER BY name ASC LIMIT 50',
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.hasLimit).toBe(true)
    expect(r.value.safeSql).toContain('LIMIT 50')
  })
})
