import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractChunks } from './index'
import { MemoryFileStore } from '../adapters/memory/memoryFileStore'
import { MemoryMysqlConnectionStore } from '../adapters/memory/memoryMysqlConnectionStore'

const FIXTURE_PDF = join(__dirname, '../../../tests/fixtures/sample.pdf')

async function storeAndGetRef(store: MemoryFileStore, data: Uint8Array, contentType: string): Promise<string> {
  const r = await store.put('test-key', data, contentType)
  if (!r.ok) throw new Error('store.put failed')
  return r.value.ref
}

describe('extractChunks', () => {
  it('pdf type: calls parsePdf and returns chunks', async () => {
    const fileStore = new MemoryFileStore()
    const mysqlConnectionStore = new MemoryMysqlConnectionStore()
    const pdfBytes = new Uint8Array(readFileSync(FIXTURE_PDF))
    const ref = await storeAndGetRef(fileStore, pdfBytes, 'application/pdf')

    const result = await extractChunks({ sourceType: 'pdf', fileRef: ref }, { fileStore, mysqlConnectionStore })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(1)
    // Chunks should have page metadata from parsePdf
    for (const chunk of result.value) {
      expect(typeof chunk.metadata['page']).toBe('number')
    }
  })

  it('md type: calls parseMd and returns chunks with headings metadata', async () => {
    const fileStore = new MemoryFileStore()
    const mysqlConnectionStore = new MemoryMysqlConnectionStore()
    const mdContent = '# Introduction\nThis is the intro section.\n## Details\nMore details here.'
    const mdBytes = new TextEncoder().encode(mdContent)
    const ref = await storeAndGetRef(fileStore, mdBytes, 'text/markdown')

    const result = await extractChunks({ sourceType: 'md', fileRef: ref }, { fileStore, mysqlConnectionStore })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(1)
    // Chunks should have headings metadata from parseMd
    for (const chunk of result.value) {
      expect(Array.isArray(chunk.metadata['headings'])).toBe(true)
    }
  })

  it('txt type: calls parseTxt and returns text chunks', async () => {
    const fileStore = new MemoryFileStore()
    const mysqlConnectionStore = new MemoryMysqlConnectionStore()
    const txtContent = 'Plain text content for extraction testing purposes.'
    const txtBytes = new TextEncoder().encode(txtContent)
    const ref = await storeAndGetRef(fileStore, txtBytes, 'text/plain')

    const result = await extractChunks({ sourceType: 'txt', fileRef: ref }, { fileStore, mysqlConnectionStore })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(1)
    expect(result.value[0]?.text).toBe(txtContent)
  })

  it('mysql_query type with no stored connection returns mysql_connection_refused', async () => {
    const fileStore = new MemoryFileStore()
    const mysqlConnectionStore = new MemoryMysqlConnectionStore()
    // No connection seeded — getCredentials will return error
    const result = await extractChunks(
      {
        sourceType: 'mysql_query',
        connectionRef: 'nonexistent-conn-id',
        query: 'SELECT * FROM docs',
        rowTemplate: '{{content}}',
        refreshCronSpec: '0 * * * *',
      },
      { fileStore, mysqlConnectionStore },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('mysql_connection_refused')
    }
  })

  it('missing file ref returns file_read_failed', async () => {
    const fileStore = new MemoryFileStore()
    const mysqlConnectionStore = new MemoryMysqlConnectionStore()
    const result = await extractChunks({ sourceType: 'txt', fileRef: 'nonexistent-ref' }, { fileStore, mysqlConnectionStore })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('file_read_failed')
    }
  })
})
