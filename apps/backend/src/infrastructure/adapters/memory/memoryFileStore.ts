import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, type AppError } from '@support/shared'
import type { FileStorePort } from '../../../application/ports'

export class MemoryFileStore implements FileStorePort {
  private files = new Map<string, { data: Uint8Array; contentType: string }>()

  put(_key: string, data: Uint8Array, contentType: string): Promise<Result<{ ref: string }, AppError>> {
    const ref = randomUUID()
    this.files.set(ref, { data, contentType })
    return Promise.resolve(Ok({ ref }))
  }

  get(ref: string): Promise<Result<Uint8Array, AppError>> {
    const f = this.files.get(ref)
    if (!f) return Promise.resolve(Err({ kind: 'file_read_failed', cause: `not found: ${ref}` }))
    return Promise.resolve(Ok(f.data))
  }

  delete(ref: string): Promise<Result<void, AppError>> {
    this.files.delete(ref)
    return Promise.resolve(Ok(undefined))
  }
}
