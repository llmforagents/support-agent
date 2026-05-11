import { Err, type Result, type IngestError } from '@support/shared'
import type { SourceConfig, RawChunk } from '../../domain/source'
import type { FileStorePort, MysqlConnectionStorePort } from '../../application/ports'

// Lazy parser dispatch: each `await import(...)` becomes a separate worker
// bundle chunk. Wrangler emits the heavy dependencies (pdf-parse, mysql2,
// gpt-tokenizer, unified+remark-parse) only into the chunks that actually
// reference them, so a request that never reaches `extractChunks` doesn't
// pay their bundle-size cost at module-load time. This is the main lever
// keeping the worker bundle under Cloudflare's 10 MB compressed limit.

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
    const { parseMysql } = await import('./mysqlParser')
    return parseMysql(credsRes.value, { query: cfg.query, rowTemplate: cfg.rowTemplate })
  }

  const file = await deps.fileStore.get(cfg.fileRef)
  if (!file.ok) {
    return Err({ kind: 'file_read_failed', cause: JSON.stringify(file.error) })
  }

  switch (cfg.sourceType) {
    case 'pdf': {
      const { parsePdf } = await import('./pdfParser')
      return parsePdf(file.value)
    }
    case 'md': {
      const { parseMd } = await import('./mdParser')
      return parseMd(new TextDecoder().decode(file.value))
    }
    case 'txt': {
      const { parseTxt } = await import('./txtParser')
      return parseTxt(file.value)
    }
  }
}
