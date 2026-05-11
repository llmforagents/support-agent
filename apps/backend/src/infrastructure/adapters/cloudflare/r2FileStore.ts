// Cloudflare R2 FileStorePort adapter. Mirrors LocalFileStore semantics:
//   * `put` ignores the caller-supplied `key`, generates a fresh UUID `ref`,
//     and writes `{ref}.bin` + `{ref}.meta.json` into the R2 bucket. This
//     matches LocalFileStore / MemoryFileStore — refs are server-issued so
//     callers can't fabricate collisions or scan the namespace.
//   * `get` returns the raw bytes (no contentType — that's the port contract
//     in apps/backend/src/application/ports.ts).
//   * Any error path reuses the existing `file_read_failed` AppError kind
//     (per the P4 plan: no new error kinds).
//
// `ref` validation matches LocalFileStore — a strict character allowlist so
// no caller can probe arbitrary R2 keys through this adapter.
import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, type AppError } from '@support/shared'
import type { FileStorePort } from '../../../application/ports'

const SAFE_REF_RE = /^[A-Za-z0-9_-]+$/

export class R2FileStore implements FileStorePort {
  constructor(private readonly bucket: R2Bucket) {}

  async put(_key: string, data: Uint8Array, contentType: string): Promise<Result<{ ref: string }, AppError>> {
    const ref = randomUUID()
    try {
      await this.bucket.put(`${ref}.bin`, data, { httpMetadata: { contentType } })
      await this.bucket.put(`${ref}.meta.json`, JSON.stringify({ contentType }), {
        httpMetadata: { contentType: 'application/json' },
      })
    } catch (err) {
      return Err({ kind: 'file_read_failed', cause: String(err) })
    }
    return Ok({ ref })
  }

  async get(ref: string): Promise<Result<Uint8Array, AppError>> {
    if (!SAFE_REF_RE.test(ref)) {
      return Err({ kind: 'file_read_failed', cause: `invalid ref: ${ref}` })
    }
    try {
      const obj = await this.bucket.get(`${ref}.bin`)
      if (!obj) {
        return Err({ kind: 'file_read_failed', cause: `not found: ${ref}` })
      }
      const ab = await obj.arrayBuffer()
      return Ok(new Uint8Array(ab))
    } catch (err) {
      return Err({ kind: 'file_read_failed', cause: String(err) })
    }
  }

  async delete(ref: string): Promise<Result<void, AppError>> {
    if (!SAFE_REF_RE.test(ref)) {
      return Err({ kind: 'file_read_failed', cause: `invalid ref: ${ref}` })
    }
    try {
      // R2 `delete` accepts an array and is a no-op for missing keys,
      // matching LocalFileStore's best-effort unlink semantics.
      await this.bucket.delete([`${ref}.bin`, `${ref}.meta.json`])
    } catch (err) {
      return Err({ kind: 'file_read_failed', cause: String(err) })
    }
    return Ok(undefined)
  }
}
