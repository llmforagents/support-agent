import { detect as detectCharset } from 'chardet'
import { Ok, type Result, type IngestError } from '@support/shared'
import { chunkText } from '../../application/kb/chunker'
import type { RawChunk } from '../../domain/source'

export function parseTxt(
  buf: Uint8Array,
  encodingHint?: 'utf8' | 'latin1',
): Result<readonly RawChunk[], IngestError> {
  let encoding: 'utf8' | 'latin1' = encodingHint ?? 'utf8'
  if (!encodingHint) {
    const detected = detectCharset(buf)
    if (detected && /latin1|iso-8859-1|windows-1252/i.test(detected)) encoding = 'latin1'
  }
  const text = new TextDecoder(encoding === 'utf8' ? 'utf-8' : 'latin1').decode(buf)
  if (text.trim() === '') return Ok([])
  return Ok(chunkText(text, { maxTokens: 500, overlapTokens: 50 }))
}
