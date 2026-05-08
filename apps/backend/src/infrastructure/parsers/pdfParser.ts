import pdfParse from 'pdf-parse'
import { Ok, Err, type Result, type IngestError } from '@support/shared'
import { chunkText } from '../../application/kb/chunker'
import type { RawChunk } from '../../domain/source'

export async function parsePdf(buf: Uint8Array): Promise<Result<readonly RawChunk[], IngestError>> {
  let text: string
  try {
    const r = await pdfParse(Buffer.from(buf))
    text = r.text
  } catch (err) {
    const msg = String(err)
    if (/encrypted|password/i.test(msg)) return Err({ kind: 'pdf_encrypted' })
    return Err({ kind: 'pdf_parse_failed', reason: msg })
  }

  if (!text || text.trim() === '') {
    return Err({ kind: 'pdf_parse_failed', reason: 'no extractable text (scanned image PDF?)' })
  }

  // Split by form-feed or multiple blank lines to approximate pages
  const pages = text.split(/\f|\n{3,}/)
  const out: RawChunk[] = []
  for (let p = 0; p < pages.length; p++) {
    const pageText = pages[p]?.trim()
    if (!pageText) continue
    const chunks = chunkText(pageText, { maxTokens: 500, overlapTokens: 50 }, { page: p + 1 })
    out.push(...chunks)
  }
  return Ok(out)
}
