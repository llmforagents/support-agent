import { describe, it, expect } from 'vitest'
import { parseMd } from './mdParser'

describe('parseMd', () => {
  it('empty document returns empty array', () => {
    const result = parseMd('')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(0)
  })

  it('whitespace-only document returns empty array', () => {
    const result = parseMd('   \n  \n  ')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(0)
  })

  it('single body without headings produces 1 chunk with no prefix', () => {
    const result = parseMd('This is some body text without any heading.')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(1)
    const chunk = result.value[0]
    expect(chunk).toBeDefined()
    if (chunk) {
      // No heading prefix — text should be the body itself
      expect(chunk.text).toBe('This is some body text without any heading.')
      expect(Array.isArray(chunk.metadata['headings'])).toBe(true)
      expect((chunk.metadata['headings'] as string[]).length).toBe(0)
    }
  })

  it('# A\\n## B\\nbody → 1 chunk with prefix "A > B" and headings metadata', () => {
    const result = parseMd('# A\n## B\nbody text here')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(1)
    const chunk = result.value[0]
    expect(chunk).toBeDefined()
    if (chunk) {
      expect(chunk.text).toBe('A > B\n\nbody text here')
      expect(chunk.metadata['headings']).toEqual(['A', 'B'])
    }
  })

  it('nested headings: # A\\nbody1\\n## B\\nbody2 → 2 chunks', () => {
    const md = '# A\nbody one content\n## B\nbody two content'
    const result = parseMd(md)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(2)

    // First chunk: headings=['A']
    const chunk0 = result.value[0]
    expect(chunk0).toBeDefined()
    if (chunk0) {
      expect(chunk0.metadata['headings']).toEqual(['A'])
      expect(chunk0.text).toContain('A\n\n')
      expect(chunk0.text).toContain('body one')
    }

    // Second chunk: headings=['A', 'B']
    const chunk1 = result.value[1]
    expect(chunk1).toBeDefined()
    if (chunk1) {
      expect(chunk1.metadata['headings']).toEqual(['A', 'B'])
      expect(chunk1.text).toContain('A > B\n\n')
      expect(chunk1.text).toContain('body two')
    }
  })

  it('heading resets chain for sibling headings', () => {
    // # A → body A → # B → body B
    // Section 1: headings=['A'], Section 2: headings=['B']
    const md = '# A\nbody of A\n# B\nbody of B'
    const result = parseMd(md)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.length).toBeGreaterThanOrEqual(2)

    const chunk0 = result.value[0]
    const chunk1 = result.value[1]
    expect(chunk0?.metadata['headings']).toEqual(['A'])
    expect(chunk1?.metadata['headings']).toEqual(['B'])
  })

  it('tokenCount is populated on each chunk', () => {
    const result = parseMd('# Title\nSome body text.')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const chunk of result.value) {
      expect(chunk.tokenCount).toBeGreaterThan(0)
    }
  })

  it('long section body produces multiple chunks if it exceeds maxTokens', () => {
    // Build a long body under one heading
    const longBody = ('The quick brown fox jumps over the lazy dog. ').repeat(120)
    const md = `# Section\n${longBody}`
    const result = parseMd(md)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Should have been split into multiple chunks
    expect(result.value.length).toBeGreaterThan(1)
    // All chunks should have the section heading in prefix
    for (const chunk of result.value) {
      expect(chunk.text.startsWith('Section\n\n')).toBe(true)
      expect(chunk.metadata['headings']).toEqual(['Section'])
    }
  })

  it('returns Ok (not error) for valid markdown', () => {
    const result = parseMd('# Hello\nworld')
    expect(result.ok).toBe(true)
  })
})
