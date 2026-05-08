import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePdf } from './pdfParser'

// Path to a known-good real PDF fixture (QOI format specification)
const FIXTURE_PDF = join(__dirname, '../../../tests/fixtures/sample.pdf')

describe('parsePdf', () => {
  it('happy path: extracts text from a real PDF and returns chunks with page metadata', async () => {
    const pdfBytes = new Uint8Array(readFileSync(FIXTURE_PDF))
    const result = await parsePdf(pdfBytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(1)
    // Each chunk should have text and page metadata
    const firstChunk = result.value[0]
    expect(firstChunk).toBeDefined()
    if (firstChunk) {
      expect(typeof firstChunk.text).toBe('string')
      expect(firstChunk.text.length).toBeGreaterThan(0)
      expect(firstChunk.tokenCount).toBeGreaterThan(0)
      // page metadata should be set (page 1 or higher)
      expect(typeof firstChunk.metadata['page']).toBe('number')
    }
  })

  it('all chunks have tokenCount > 0 and page metadata', async () => {
    const pdfBytes = new Uint8Array(readFileSync(FIXTURE_PDF))
    const result = await parsePdf(pdfBytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const chunk of result.value) {
      expect(chunk.tokenCount).toBeGreaterThan(0)
      expect(typeof chunk.metadata['page']).toBe('number')
    }
  })

  it('corrupted bytes returns pdf_parse_failed', async () => {
    const result = await parsePdf(new Uint8Array([0, 0, 0, 1, 2, 3]))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('pdf_parse_failed')
    }
  })

  it('non-PDF bytes return pdf_parse_failed', async () => {
    // Random bytes that are definitely not a PDF
    const garbage = new Uint8Array(512).fill(0x42)
    const result = await parsePdf(garbage)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('pdf_parse_failed')
    }
  })

  it('returns RawChunks with correct shape', async () => {
    const pdfBytes = new Uint8Array(readFileSync(FIXTURE_PDF))
    const result = await parsePdf(pdfBytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const chunk of result.value) {
      expect(typeof chunk.text).toBe('string')
      expect(typeof chunk.tokenCount).toBe('number')
      expect(chunk.tokenCount).toBeGreaterThan(0)
      expect(typeof chunk.metadata).toBe('object')
    }
  })

  // TODO: encrypted PDF test — hard to generate in-test; skipped in P2
})
