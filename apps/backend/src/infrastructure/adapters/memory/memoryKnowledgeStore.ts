import { randomUUID } from 'node:crypto'
import { Ok, Err, type Result, type AppError, SourceId } from '@support/shared'
import type { Source, SourceConfig, SourceState, SourceType } from '../../../domain/source'
import type { KnowledgeStorePort } from '../../../application/ports'

export class MemoryKnowledgeStore implements KnowledgeStorePort {
  private sources = new Map<string, Source>()

  createSource(input: { name: string; sourceType: SourceType; config: SourceConfig }): Promise<Result<Source, AppError>> {
    const now = new Date()
    const source: Source = {
      id: SourceId(randomUUID()),
      name: input.name,
      sourceType: input.sourceType,
      config: input.config,
      state: { status: 'idle', currentGeneration: 0 },
      active: true,
      createdAt: now,
      updatedAt: now,
    }
    this.sources.set(source.id, source)
    return Promise.resolve(Ok(source))
  }

  getSource(id: SourceId): Promise<Result<Source, AppError>> {
    const s = this.sources.get(id)
    if (!s) return Promise.resolve(Err({ kind: 'source_not_found' }))
    return Promise.resolve(Ok(s))
  }

  listSources(): Promise<Result<readonly Source[], AppError>> {
    return Promise.resolve(Ok([...this.sources.values()]))
  }

  updateSourceState(id: SourceId, state: SourceState): Promise<Result<void, AppError>> {
    const s = this.sources.get(id)
    if (!s) return Promise.resolve(Err({ kind: 'source_not_found' }))
    this.sources.set(id, { ...s, state, updatedAt: new Date() })
    return Promise.resolve(Ok(undefined))
  }

  setActive(id: SourceId, active: boolean): Promise<Result<void, AppError>> {
    const s = this.sources.get(id)
    if (!s) return Promise.resolve(Err({ kind: 'source_not_found' }))
    this.sources.set(id, { ...s, active, updatedAt: new Date() })
    return Promise.resolve(Ok(undefined))
  }

  deleteSource(id: SourceId): Promise<Result<void, AppError>> {
    this.sources.delete(id)
    return Promise.resolve(Ok(undefined))
  }
}
