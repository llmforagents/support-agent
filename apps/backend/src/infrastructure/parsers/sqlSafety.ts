import { Parser } from 'node-sql-parser'
import { Ok, Err, type Result, type IngestError } from '@support/shared'

const parser = new Parser()

const DENIED_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
  'TRUNCATE', 'GRANT', 'REVOKE', 'EXEC', 'CALL', 'LOAD', 'UNION',
] as const

export function validateSelectQuery(rawSql: string): Result<{ safeSql: string; hasLimit: boolean }, IngestError> {
  const normalised = rawSql.trim().replace(/;\s*$/, '')

  // Pre-filter for denied keywords (regex check); AST below is the authoritative gate.
  const upper = ' ' + normalised.toUpperCase() + ' '
  for (const kw of DENIED_KEYWORDS) {
    if (upper.includes(' ' + kw + ' ')) {
      return Err({ kind: 'mysql_unsafe_query', reason: 'denied_keyword' })
    }
  }

  // Multiple statements check (semicolons after trailing one has been stripped)
  if (normalised.includes(';')) {
    return Err({ kind: 'mysql_unsafe_query', reason: 'multiple_statements' })
  }

  let ast
  try {
    ast = parser.astify(normalised, { database: 'MySQL' })
  } catch {
    return Err({ kind: 'mysql_unsafe_query', reason: 'parse_error' })
  }

  const stmts = Array.isArray(ast) ? ast : [ast]
  if (stmts.length !== 1) {
    return Err({ kind: 'mysql_unsafe_query', reason: 'multiple_statements' })
  }

  const stmt = stmts[0]
  if (!stmt || stmt.type !== 'select') {
    return Err({ kind: 'mysql_unsafe_query', reason: 'not_select' })
  }

  const hasLimit = stmt.limit !== undefined && stmt.limit !== null
  const safeSql = hasLimit ? normalised : `${normalised} LIMIT 5000`
  return Ok({ safeSql, hasLimit })
}
