import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractChunks } from './index'
import { MemoryFileStore } from '../adapters/memory/memoryFileStore'

const FIXTURE_PDF = join(__dirname, '../../../tests/fixtures/sample.pdf')

async function storeAndGetRef(store: MemoryFileStore, data: Uint8Array, contentType: string): Promise<string> {
  const r = await store.put('test-key', data, contentType)
  if (!r.ok) throw new Error('store.put failed')
  return r.value.ref
}

describe('extractChunks', () => {
  it('pdf type: calls parsePdf and returns chunks', async () => {
    const store = new MemoryFileStore()
    const pdfBytes = new Uint8Array(readFileSync(FIXTURE_PDF))
    const ref = await storeAndGetRef(store, pdfBytes, 'application/pdf')

    const result = await extractChunks({ sourceType: 'pdf', fileRef: ref }, store)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(1)
    // Chunks should have page metadata from parsePdf
    for (const chunk of result.value) {
      expect(typeof chunk.metadata['page']).toBe('number')
    }
  })

  it('md type: calls parseMd and returns chunks with headings metadata', async () => {
    const store = new MemoryFileStore()
    const mdContent = '# Introduction\nThis is the intro section.\n## Details\nMore details here.'
    const mdBytes = new TextEncoder().encode(mdContent)
    const ref = await storeAndGetRef(store, mdBytes, 'text/markdown')

    const result = await extractChunks({ sourceType: 'md', fileRef: ref }, store)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(1)
    // Chunks should have headings metadata from parseMd
    for (const chunk of result.value) {
      expect(Array.isArray(chunk.metadata['headings'])).toBe(true)
    }
  })

  it('txt type: calls parseTxt and returns text chunks', async () => {
    const store = new MemoryFileStore()
    const txtContent = 'Plain text content for extraction testing purposes.'
    const txtBytes = new TextEncoder().encode(txtContent)
    const ref = await storeAndGetRef(store, txtBytes, 'text/plain')

    const result = await extractChunks({ sourceType: 'txt', fileRef: ref }, store)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(1)
    expect(result.value[0]?.text).toBe(txtContent)
  })

  it('mysql_query type: returns Err without touching fileStore', async () => {
    const store = new MemoryFileStore()
    // No files stored in store — mysql_query should return error immediately
    const result = await extractChunks(
      {
        sourceType: 'mysql_query',
        connectionRef: 'conn-1',
        query: 'SELECT * FROM docs',
        rowTemplate: '{{content}}',
        refreshCronSpec: '0 * * * *',
      },
      store,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('pdf_parse_failed')
      expect((result.error as { reason: string }).reason).toContain('mysql_query not implemented')
    }
  })

  it('missing file ref returns file_read_failed', async () => {
    const store = new MemoryFileStore()
    const result = await extractChunks({ sourceType: 'txt', fileRef: 'nonexistent-ref' }, store)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('file_read_failed')
    }
  })
})
