import { encode, decode } from 'gpt-tokenizer'
import type { RawChunk } from '../../domain/source'

export type ChunkOpts = Readonly<{
  maxTokens: number
  overlapTokens: number
  prefix?: string
}>

const SENTENCE_BREAK_RE = /[.!?\n]\s+|\n\n+/g

function findBreakNear(text: string, target: number): number {
  // Walk backwards/forwards from `target` looking for sentence break within ±100 chars
  const window = 100
  const start = Math.max(0, target - window)
  const end = Math.min(text.length, target + window)
  const sub = text.slice(start, end)
  const matches = [...sub.matchAll(SENTENCE_BREAK_RE)]
  if (matches.length === 0) return target
  // Pick the match whose end-index (relative to original) is closest to target
  let best = target
  let bestDist = Infinity
  for (const m of matches) {
    const abs = start + (m.index ?? 0) + m[0].length
    const d = Math.abs(abs - target)
    if (d < bestDist) {
      bestDist = d
      best = abs
    }
  }
  return best
}

export function chunkText(
  text: string,
  opts: ChunkOpts,
  baseMetadata: Readonly<Record<string, unknown>> = {},
): readonly RawChunk[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) return []

  const prefix = opts.prefix ? `${opts.prefix}\n\n` : ''
  const fullTokens = encode(trimmed)

  if (fullTokens.length <= opts.maxTokens) {
    const finalText = prefix + trimmed
    return [{ text: finalText, tokenCount: encode(finalText).length, metadata: baseMetadata }]
  }

  // Walk character offsets in approximate steps of (maxTokens - overlapTokens) tokens.
  const chunks: RawChunk[] = []
  const stepTokens = Math.max(1, opts.maxTokens - opts.overlapTokens)
  let cursor = 0

  while (cursor < trimmed.length) {
    const remainingText = trimmed.slice(cursor)
    const remTokens = encode(remainingText)
    if (remTokens.length === 0) break

    const sliceTokens = remTokens.slice(0, opts.maxTokens)
    const sliceText = decode(sliceTokens)

    // snap end to a sentence break near sliceText.length
    const targetEnd = cursor + sliceText.length
    const snappedEnd = findBreakNear(trimmed, targetEnd)
    const chunkRawText = trimmed.slice(cursor, Math.max(snappedEnd, cursor + 1))
    const finalText = prefix + chunkRawText
    chunks.push({ text: finalText, tokenCount: encode(finalText).length, metadata: baseMetadata })

    if (snappedEnd <= cursor) break // safety

    // advance by stepTokens worth of characters (approximate via decode of stepTokens tokens)
    const stepText = decode(remTokens.slice(0, stepTokens))
    cursor = Math.min(cursor + Math.max(stepText.length, 1), trimmed.length)
  }

  return chunks
}
