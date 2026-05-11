// In-memory Vectorize stub used by the Cloudflare integration tests.
//
// Why this exists:
//   vitest-pool-workers 0.5.41 bundles miniflare 3.20241230.0, which has NO
//   Vectorize implementation. We can't bind a real (or even mocked) Vectorize
//   to the test isolate. To still exercise VectorizeStore at the
//   logic-against-a-real-interface level, tests construct this mock and pass it
//   to the store. Cosine similarity is computed in pure JS over a small
//   Map<id, vector>. Behavior:
//
//     * `upsert`/`insert` — store/overwrite by id.
//     * `query` — returns top-K matches by cosine similarity, optionally with
//       metadata. No namespace or filter support — D2-D4 tests don't need it.
//     * `deleteByIds` — drops entries; count reflects how many ids actually
//       existed.
//
//   The return shapes (`{ ids, count }`, `{ matches, count }`) match the BETA
//   VectorizeIndex declared in @cloudflare/workers-types, which is what
//   `apps/backend/tests/cloudflare/env.d.ts` augments. The test binding casts
//   `new InMemoryVectorize()` to `VectorizeIndex` once — this is the only `as`
//   cast in the test, and it's the test-fixture exception explicitly sanctioned
//   by the project's TypeScript rules.

type StoredVec = Readonly<{
  id: string
  values: readonly number[]
  metadata: Readonly<Record<string, VectorizeVectorMetadata>>
}>

type UpsertInput = Readonly<{
  id: string
  values: VectorFloatArray | readonly number[]
  metadata?: Record<string, VectorizeVectorMetadata>
}>

export class InMemoryVectorize {
  private readonly storeMap = new Map<string, StoredVec>()

  upsert = (
    vectors: readonly UpsertInput[],
  ): Promise<{ ids: string[]; count: number }> => {
    const ids: string[] = []
    for (const v of vectors) {
      this.storeMap.set(v.id, {
        id: v.id,
        values: Array.from(v.values),
        metadata: { ...(v.metadata ?? {}) },
      })
      ids.push(v.id)
    }
    return Promise.resolve({ ids, count: vectors.length })
  }

  insert = (
    vectors: readonly UpsertInput[],
  ): Promise<{ ids: string[]; count: number }> => {
    // Real VectorizeIndex.insert throws on id collision; the mock matches that
    // strictly to surface accidental misuse in tests.
    for (const v of vectors) {
      if (this.storeMap.has(v.id)) {
        return Promise.reject(new Error(`InMemoryVectorize.insert: id ${v.id} already exists`))
      }
    }
    return this.upsert(vectors)
  }

  query = (
    vector: VectorFloatArray | readonly number[],
    opts?: { topK?: number; returnMetadata?: boolean | string },
  ): Promise<{ matches: Array<{ id: string; score: number; metadata?: Record<string, VectorizeVectorMetadata> }>; count: number }> => {
    const k = opts?.topK ?? 5
    const wantMeta = Boolean(opts?.returnMetadata) && opts?.returnMetadata !== 'none'
    const q = Array.from(vector)
    const all: Array<{ id: string; score: number; metadata?: Record<string, VectorizeVectorMetadata> }> = []
    for (const v of this.storeMap.values()) {
      const score = cosine(q, v.values)
      const entry: { id: string; score: number; metadata?: Record<string, VectorizeVectorMetadata> } = { id: v.id, score }
      if (wantMeta) entry.metadata = { ...v.metadata }
      all.push(entry)
    }
    all.sort((a, b) => b.score - a.score)
    const top = all.slice(0, k)
    return Promise.resolve({ matches: top, count: top.length })
  }

  deleteByIds = (ids: readonly string[]): Promise<{ ids: string[]; count: number }> => {
    const deleted: string[] = []
    for (const id of ids) {
      if (this.storeMap.delete(id)) deleted.push(id)
    }
    return Promise.resolve({ ids: deleted, count: deleted.length })
  }

  // Test-only introspection helpers — not part of the VectorizeIndex shape.
  size(): number {
    return this.storeMap.size
  }

  ids(): readonly string[] {
    return [...this.storeMap.keys()]
  }
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0
  let magA = 0
  let magB = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    dot += ai * bi
    magA += ai * ai
    magB += bi * bi
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}
