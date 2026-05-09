import { Err, type Result, type IngestError } from '@support/shared'
import type { SourceConfig, RawChunk } from '../../domain/source'
import type { FileStorePort, MysqlConnectionStorePort } from '../../application/ports'
import { parsePdf } from './pdfParser'
import { parseMd } from './mdParser'
import { parseTxt } from './txtParser'
import { parseMysql } from './mysqlParser'

export type ExtractDeps = Readonly<{
  fileStore: FileStorePort
  mysqlConnectionStore: MysqlConnectionStorePort
}>

export async function extractChunks(
  cfg: SourceConfig,
  deps: ExtractDeps,
): Promise<Result<readonly RawChunk[], IngestError>> {
  if (cfg.sourceType === 'mysql_query') {
    const credsRes = await deps.mysqlConnectionStore.getCredentials(cfg.connectionRef)
    if (!credsRes.ok) {
      return Err({ kind: 'mysql_connection_refused', host: '?' })
    }
    return parseMysql(credsRes.value, { query: cfg.query, rowTemplate: cfg.rowTemplate })
  }

  const file = await deps.fileStore.get(cfg.fileRef)
  if (!file.ok) {
    return Err({ kind: 'file_read_failed', cause: JSON.stringify(file.error) })
  }

  switch (cfg.sourceType) {
    case 'pdf': return parsePdf(file.value)
    case 'md':  return parseMd(new TextDecoder().decode(file.value))
    case 'txt': return parseTxt(file.value)
  }
}
