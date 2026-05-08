import { Err, type Result, type IngestError } from '@support/shared'
import type { SourceConfig, RawChunk } from '../../domain/source'
import type { FileStorePort } from '../../application/ports'
import { parsePdf } from './pdfParser'
import { parseMd } from './mdParser'
import { parseTxt } from './txtParser'

export async function extractChunks(
  cfg: SourceConfig,
  fileStore: FileStorePort,
): Promise<Result<readonly RawChunk[], IngestError>> {
  if (cfg.sourceType === 'mysql_query') {
    return Err({ kind: 'pdf_parse_failed', reason: 'mysql_query not implemented in P2' })
  }

  const file = await fileStore.get(cfg.fileRef)
  if (!file.ok) {
    return Err({ kind: 'file_read_failed', cause: JSON.stringify(file.error) })
  }

  switch (cfg.sourceType) {
    case 'pdf': return parsePdf(file.value)
    case 'md':  return parseMd(new TextDecoder().decode(file.value))
    case 'txt': return parseTxt(file.value)
  }
}
