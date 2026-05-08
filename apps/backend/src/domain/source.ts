import type { ChunkId, SourceId } from '@support/shared'

// ---------------------------------------------------------------------------
// Source type
// ---------------------------------------------------------------------------

export type SourceType = 'pdf' | 'md' | 'txt' | 'mysql_query'

// ---------------------------------------------------------------------------
// Source config — discriminated by sourceType
// ---------------------------------------------------------------------------

export type SourceConfig =
  | { readonly sourceType: 'pdf';         readonly fileRef: string }
  | { readonly sourceType: 'md';          readonly fileRef: string }
  | { readonly sourceType: 'txt';         readonly fileRef: string }
  | {
      readonly sourceType: 'mysql_query'
      readonly connectionRef: string
      readonly query: string
      readonly rowTemplate: string
      readonly refreshCronSpec: string
    }

// ---------------------------------------------------------------------------
// Source state machine — discriminated by status
// Every variant carries the current generation so callers always have it.
// ---------------------------------------------------------------------------

export type SourceState =
  | { readonly status: 'idle';      readonly currentGeneration: number }
  | {
      readonly status: 'ingesting'
      readonly currentGeneration: number
      readonly pendingGeneration: number
      readonly startedAt: Date
      readonly progress: Readonly<{ processed: number; total: number }>
    }
  | {
      readonly status: 'ready'
      readonly currentGeneration: number
      readonly ingestedAt: Date
      readonly chunkCount: number
    }
  | {
      readonly status: 'error'
      readonly currentGeneration: number
      readonly error: Readonly<Record<string, unknown>>
      readonly failedAt: Date
    }
  | { readonly status: 'paused';    readonly currentGeneration: number }

// ---------------------------------------------------------------------------
// Source aggregate
// ---------------------------------------------------------------------------

export type Source = Readonly<{
  id: SourceId
  name: string
  sourceType: SourceType
  config: SourceConfig
  state: SourceState
  active: boolean
  createdAt: Date
  updatedAt: Date
}>

// ---------------------------------------------------------------------------
// Chunk types
// ---------------------------------------------------------------------------

export type RawChunk = Readonly<{
  text: string
  tokenCount: number
  metadata: Readonly<Record<string, unknown>>
}>

export type ChunkInsert = RawChunk & Readonly<{
  id: ChunkId
  sourceId: SourceId
  chunkIndex: number
  embedding: readonly number[]
  ingestGeneration: number
}>

export type ChunkHit = Readonly<{
  id: ChunkId
  sourceId: SourceId
  sourceName: string
  text: string
  score: number
  metadata: Readonly<Record<string, unknown>>
}>
