import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, type AppError } from '@support/shared'
import type { FileStorePort } from '../../../application/ports'

const SAFE_REF_RE = /^[A-Za-z0-9_-]+$/

export class LocalFileStore implements FileStorePort {
  constructor(private readonly basePath: string) {}

  async put(_key: string, data: Uint8Array, contentType: string): Promise<Result<{ ref: string }, AppError>> {
    await mkdir(this.basePath, { recursive: true })
    const ref = randomUUID()
    const dataPath = join(this.basePath, `${ref}.bin`)
    const metaPath = join(this.basePath, `${ref}.meta.json`)
    await writeFile(dataPath, data)
    await writeFile(metaPath, JSON.stringify({ contentType }), 'utf8')
    return Ok({ ref })
  }

  async get(ref: string): Promise<Result<Uint8Array, AppError>> {
    if (!SAFE_REF_RE.test(ref)) {
      return Err({ kind: 'file_read_failed', cause: `invalid ref: ${ref}` })
    }
    const dataPath = join(this.basePath, `${ref}.bin`)
    try {
      const buf = await readFile(dataPath)
      return Ok(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
    } catch (err) {
      return Err({ kind: 'file_read_failed', cause: String(err) })
    }
  }

  async delete(ref: string): Promise<Result<void, AppError>> {
    if (!SAFE_REF_RE.test(ref)) {
      return Err({ kind: 'file_read_failed', cause: `invalid ref: ${ref}` })
    }
    const dataPath = join(this.basePath, `${ref}.bin`)
    const metaPath = join(this.basePath, `${ref}.meta.json`)
    try {
      await unlink(dataPath)
    } catch {
      // best-effort: file may not exist
    }
    try {
      await unlink(metaPath)
    } catch {
      // best-effort
    }
    return Ok(undefined)
  }
}
