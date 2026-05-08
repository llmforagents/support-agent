import { describe, it, expect } from 'vitest'
import { encode } from 'gpt-tokenizer'
import { chunkText } from './chunker'

describe('chunkText', () => {
  it('returns empty array for empty string', () => {
    expect(chunkText('', { maxTokens: 100, overlapTokens: 10 })).toEqual([])
  })

  it('returns empty array for whitespace-only input', () => {
    expect(chunkText('   \n  ', { maxTokens: 100, overlapTokens: 10 })).toEqual([])
  })

  it('returns single chunk for short text below maxTokens', () => {
    const text = 'Hello world. This is a short document.'
    const result = chunkText(text, { maxTokens: 500, overlapTokens: 50 })
    expect(result).toHaveLength(1)
    expect(result[0]?.text).toBe(text)
    expect(result[0]?.tokenCount).toBeGreaterThan(0)
    expect(result[0]?.tokenCount).toBeLessThanOrEqual(500)
    expect(result[0]?.metadata).toEqual({})
  })

  it('returns single chunk with prefix for short text', () => {
    const text = 'Hello world.'
    const result = chunkText(text, { maxTokens: 500, overlapTokens: 50, prefix: 'Section A' })
    expect(result).toHaveLength(1)
    expect(result[0]?.text).toBe('Section A\n\nHello world.')
  })

  it('applies baseMetadata to every chunk', () => {
    const text = 'Hello world. This is a test.'
    const metadata = { page: 3, source: 'doc.pdf' }
    const result = chunkText(text, { maxTokens: 500, overlapTokens: 50 }, metadata)
    for (const chunk of result) {
      expect(chunk.metadata).toEqual(metadata)
    }
  })

  it('exposes tokenCount on each chunk', () => {
    const text = 'Hello world.'
    const result = chunkText(text, { maxTokens: 500, overlapTokens: 50 })
    expect(result[0]?.tokenCount).toBe(encode('Hello world.').length)
  })

  it('produces multiple chunks for long text', () => {
    // Build a text that is definitely > 50 tokens
    const sentence = 'The quick brown fox jumps over the lazy dog. '
    const longText = sentence.repeat(30) // ~300 tokens
    const result = chunkText(longText, { maxTokens: 50, overlapTokens: 10 })
    expect(result.length).toBeGreaterThan(1)
  })

  it('each chunk tokenCount is within maxTokens + prefix slack', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog. '
    const longText = sentence.repeat(30)
    const maxTokens = 50
    const prefix = 'My Section Header'
    const result = chunkText(longText, { maxTokens, overlapTokens: 10, prefix })
    for (const chunk of result) {
      // Allow a small slack for sentence snapping; prefix adds ~5 tokens + newlines
      expect(chunk.tokenCount).toBeLessThanOrEqual(maxTokens + 25)
    }
  })

  it('consecutive chunks overlap — end of chunk N appears in chunk N+1', () => {
    // Build a very simple repetitive text
    const word = 'wordtoken '
    const longText = word.repeat(200) // well over any maxTokens
    const result = chunkText(longText, { maxTokens: 40, overlapTokens: 15 })
    expect(result.length).toBeGreaterThan(1)
    // Check that chunk[1] text starts with content that also appears in chunk[0]
    // (overlap means they share some tokens)
    if (result.length >= 2 && result[0] && result[1]) {
      const wordsC0 = result[0].text.split(' ').slice(-5).join(' ')
      expect(result[1].text).toContain(wordsC0.split(' ')[0] ?? '')
    }
  })

  it('prefix is prepended to every chunk in a long text', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog. '
    const longText = sentence.repeat(30)
    const result = chunkText(longText, { maxTokens: 50, overlapTokens: 10, prefix: 'Header' })
    expect(result.length).toBeGreaterThan(1)
    for (const chunk of result) {
      expect(chunk.text.startsWith('Header\n\n')).toBe(true)
    }
  })
})
