// Workers-compatible password hasher.
//
// The Postgres path uses the native `bcrypt` package, which is a Node addon
// (.node binary) and cannot be bundled into a Workers script. `bcryptjs` is
// a pure-JS reimplementation producing the same `$2a$`/`$2b$` hash format,
// so hashes are interchangeable between the two backends.
//
// Cost factor matches the Postgres path (12 rounds). bcryptjs's `genSalt`
// is synchronous in pure-JS mode but exposes a Promise-returning API for
// parity with the native bcrypt; we use the async form here.
import bcrypt from 'bcryptjs'

const ROUNDS = 12

export function hashPasswordCloudflare(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, ROUNDS)
}

export function verifyPasswordCloudflare(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash)
}
