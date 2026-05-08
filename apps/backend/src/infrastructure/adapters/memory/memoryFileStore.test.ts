import { describe, it, expect } from 'vitest'
import { MemoryFileStore } from './memoryFileStore'

describe('MemoryFileStore', () => {
  it('put returns a ref string', async () => {
    const store = new MemoryFileStore()
    const data = new Uint8Array([1, 2, 3])
    const r = await store.put('my-key', data, 'application/octet-stream')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(typeof r.value.ref).toBe('string')
      expect(r.value.ref.length).toBeGreaterThan(0)
    }
  })

  it('get returns the stored data', async () => {
    const store = new MemoryFileStore()
    const data = new Uint8Array([10, 20, 30, 40])
    const putResult = await store.put('key1', data, 'application/pdf')
    if (!putResult.ok) throw new Error('put failed')

    const getResult = await store.get(putResult.value.ref)
    expect(getResult.ok).toBe(true)
    if (getResult.ok) {
      expect(Array.from(getResult.value)).toEqual([10, 20, 30, 40])
    }
  })

  it('get returns file_read_failed for unknown ref', async () => {
    const store = new MemoryFileStore()
    const r = await store.get('nonexistent-ref')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('file_read_failed')
  })

  it('delete removes the file', async () => {
    const store = new MemoryFileStore()
    const data = new Uint8Array([7, 8, 9])
    const putResult = await store.put('key2', data, 'text/plain')
    if (!putResult.ok) throw new Error('put failed')

    const delResult = await store.delete(putResult.value.ref)
    expect(delResult.ok).toBe(true)

    const getResult = await store.get(putResult.value.ref)
    expect(getResult.ok).toBe(false)
    if (!getResult.ok) expect(getResult.error.kind).toBe('file_read_failed')
  })

  it('delete is idempotent on missing ref', async () => {
    const store = new MemoryFileStore()
    const r = await store.delete('does-not-exist')
    expect(r.ok).toBe(true)
  })

  it('each put generates a unique ref', async () => {
    const store = new MemoryFileStore()
    const data = new Uint8Array([1])
    const r1 = await store.put('k', data, 'application/octet-stream')
    const r2 = await store.put('k', data, 'application/octet-stream')
    if (!r1.ok || !r2.ok) throw new Error('put failed')
    expect(r1.value.ref).not.toBe(r2.value.ref)
  })

  it('stores multiple files independently', async () => {
    const store = new MemoryFileStore()
    const r1 = await store.put('a', new Uint8Array([1]), 'text/plain')
    const r2 = await store.put('b', new Uint8Array([2]), 'text/plain')
    if (!r1.ok || !r2.ok) throw new Error('put failed')

    const g1 = await store.get(r1.value.ref)
    const g2 = await store.get(r2.value.ref)
    expect(g1.ok && Array.from(g1.value)).toEqual([1])
    expect(g2.ok && Array.from(g2.value)).toEqual([2])
  })
})
