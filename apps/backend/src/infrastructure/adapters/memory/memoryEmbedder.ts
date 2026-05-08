import { createHash } from 'node:crypto'
import { Ok, type Result, type AppError } from '@support/shared'
import type { EmbedderPort } from '../../../application/ports'

export class MemoryEmbedder implements EmbedderPort {
  constructor(public readonly dimension: number = 1536) {}

  embed(texts: readonly string[], _apiKey: string = ''): Promise<Result<readonly (readonly number[])[], AppError>> {
    const out = texts.map((t) => this.vectorize(t))
    return Promise.resolve(Ok(out))
  }

  private vectorize(text: string): readonly number[] {
    const buf = createHash('sha512').update(text).digest()
    const v: number[] = []
    for (let i = 0; i < this.dimension; i++) {
      v.push(((buf[i % buf.length] ?? 0) - 128) / 128)
    }
    return v
  }
}
