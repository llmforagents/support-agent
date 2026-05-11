// Integration tests for R2FileStore. Run against the real miniflare R2
// binding declared in tests/cloudflare/vitest.config.ts (`FILES`).
//
// Test names mirror apps/backend/src/infrastructure/adapters/filesystem/
// localFileStore.integration.test.ts 1:1. Behaviour is verified against the
// FileStorePort contract (apps/backend/src/application/ports.ts), not the
// local adapter's filesystem-specific incidentals. The path-traversal /
// forward-slash refs are still rejected here — R2FileStore reuses the same
// strict allowlist so no caller can probe arbitrary R2 keys through this
// adapter.
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { R2FileStore } from '../../src/infrastructure/adapters/cloudflare/r2FileStore'

async function emptyBucket(bucket: R2Bucket): Promise<void> {
  const listed = await bucket.list()
  if (listed.objects.length === 0) return
  await bucket.delete(listed.objects.map((o) => o.key))
}

describe('R2FileStore (integration)', () => {
  beforeEach(async () => {
    await emptyBucket(env.FILES)
  })

  it('put + get round-trip', async () => {
    const store = new R2FileStore(env.FILES)
    const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"
    const putResult = await store.put('test-key', data, 'text/plain')
    expect(putResult.ok).toBe(true)
    if (!putResult.ok) return

    const getResult = await store.get(putResult.value.ref)
    expect(getResult.ok).toBe(true)
    if (getResult.ok) {
      expect(Array.from(getResult.value)).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f])
    }
  })

  it('get returns file_read_failed for unknown ref', async () => {
    const store = new R2FileStore(env.FILES)
    const r = await store.get('00000000-0000-0000-0000-000000000000')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('file_read_failed')
  })

  it('delete removes the file', async () => {
    const store = new R2FileStore(env.FILES)
    const data = new Uint8Array([1, 2, 3])
    const putResult = await store.put('del-test', data, 'application/octet-stream')
    if (!putResult.ok) throw new Error('put failed')

    const delResult = await store.delete(putResult.value.ref)
    expect(delResult.ok).toBe(true)

    const getResult = await store.get(putResult.value.ref)
    expect(getResult.ok).toBe(false)
    if (!getResult.ok) expect(getResult.error.kind).toBe('file_read_failed')
  })

  it('rejects invalid ref with path-traversal characters', async () => {
    const store = new R2FileStore(env.FILES)
    const r = await store.get('../etc/passwd')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('file_read_failed')
  })

  it('rejects ref with forward slash', async () => {
    const store = new R2FileStore(env.FILES)
    const r = await store.get('sub/dir/file')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('file_read_failed')
  })

  it('stores large binary data faithfully', async () => {
    const store = new R2FileStore(env.FILES)
    const data = new Uint8Array(1024)
    for (let i = 0; i < 1024; i++) data[i] = i % 256
    const putResult = await store.put('binary-key', data, 'application/octet-stream')
    if (!putResult.ok) throw new Error('put failed')

    const getResult = await store.get(putResult.value.ref)
    expect(getResult.ok).toBe(true)
    if (getResult.ok) {
      expect(getResult.value.length).toBe(1024)
      expect(getResult.value[0]).toBe(0)
      expect(getResult.value[255]).toBe(255)
    }
  })

  it('creates basePath automatically if it does not exist', async () => {
    // R2 has no "basePath" — the bucket binding is the namespace and is
    // always present. The port contract this test exercises is "put works
    // without any pre-setup against a fresh adapter instance", which is the
    // intent here. Bucket was just emptied by beforeEach.
    const store = new R2FileStore(env.FILES)
    const r = await store.put('k', new Uint8Array([42]), 'application/octet-stream')
    expect(r.ok).toBe(true)
  })
})
