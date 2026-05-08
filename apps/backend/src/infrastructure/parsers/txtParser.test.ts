import { describe, it, expect } from 'vitest'
import { parseTxt } from './txtParser'

describe('parseTxt', () => {
  it('empty buffer returns empty array', () => {
    const result = parseTxt(new Uint8Array(0))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(0)
  })

  it('whitespace-only buffer returns empty array', () => {
    const buf = new TextEncoder().encode('   \n   ')
    const result = parseTxt(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(0)
  })

  it('ASCII text returns at least 1 chunk', () => {
    const text = 'Hello world. This is a plain text document.'
    const buf = new TextEncoder().encode(text)
    const result = parseTxt(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(1)
    expect(result.value[0]?.text).toBe(text)
    expect(result.value[0]?.tokenCount).toBeGreaterThan(0)
  })

  it('UTF-8 text with Spanish characters is preserved', () => {
    const text = 'El niño aprende español. La ñoñería está bien. Café y más café.'
    const buf = new TextEncoder().encode(text)
    const result = parseTxt(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(1)
    const allText = result.value.map((c) => c.text).join('')
    expect(allText).toContain('niño')
    expect(allText).toContain('español')
    expect(allText).toContain('Café')
  })

  it('latin1 input with hint="latin1" preserves accented characters', () => {
    // Manually encode "café" in latin1: c=0x63, a=0x61, f=0x66, é=0xE9
    const latin1Bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x20, 0x65, 0x73, 0x20, 0x62, 0x75, 0x65, 0x6e, 0x6f])
    // "café es bueno" in latin1
    const result = parseTxt(latin1Bytes, 'latin1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(1)
    const text = result.value[0]?.text ?? ''
    expect(text).toContain('caf')
    expect(text).toContain('bueno')
    // The é character should be present (latin1 decoding maps 0xE9 to é)
    expect(text).toContain('é')
  })

  it('returns Ok result type', () => {
    const buf = new TextEncoder().encode('Some text content here.')
    const result = parseTxt(buf)
    expect(result.ok).toBe(true)
  })

  it('each chunk has tokenCount > 0', () => {
    const buf = new TextEncoder().encode('Some meaningful text for token counting.')
    const result = parseTxt(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const chunk of result.value) {
      expect(chunk.tokenCount).toBeGreaterThan(0)
    }
  })

  it('long text produces multiple chunks', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog. '
    const longText = sentence.repeat(120) // well over 500 tokens
    const buf = new TextEncoder().encode(longText)
    const result = parseTxt(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThan(1)
  })
})
