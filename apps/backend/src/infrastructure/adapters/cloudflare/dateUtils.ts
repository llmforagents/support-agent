// Shared SQLite/D1 datetime helpers.
//
// D1 columns use SQLite's native `datetime('now')` format —
// `YYYY-MM-DD HH:MM:SS` (UTC, space separator, no milliseconds, no Z).
// We pin every adapter to this single format so that lexicographic TEXT
// compares against `datetime('now')` (e.g. `expires_at <= datetime('now')`,
// or any future `closed_at < datetime('now')` sweep) behave like temporal
// compares. Mixing ISO-8601-Z and SQLite-format strings would work today
// by luck (the prefixes happen to sort right) and break the moment one
// side gains/loses a fractional component or a trailing 'Z'.
//
// Used by: d1AdminSessionStore, d1SessionStore (and any future D1 adapter
// that writes Date values into TEXT columns).

export function toSqliteDatetime(d: Date): string {
  // 'YYYY-MM-DDTHH:mm:ss.sssZ' -> 'YYYY-MM-DD HH:mm:ss'
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
}

export function parseSqliteDatetime(s: string): Date {
  // SQLite returns 'YYYY-MM-DD HH:MM:SS' (UTC). Re-hydrate to a JS Date.
  return new Date(`${s.replace(' ', 'T')}Z`)
}
