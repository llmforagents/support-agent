// D1 implementation of SiteConfigStorePort. Mirrors PgSiteConfigStore
// semantics:
//   • single-row table: id = 1 (enforced by CHECK in migration 0001)
//   • upsertOnboarding uses `INSERT … ON CONFLICT(id) DO UPDATE SET …`
//     so the first call inserts and subsequent calls update
//   • setAdminOnline / setOnboardingStep are plain UPDATEs on the singleton
//
// D1-specific accommodations vs Pg:
//   • Boolean columns (`mcp_enabled`, `admin_online`, `onboarding_completed`)
//     are stored as INTEGER (0/1). Reads coerce via `Boolean(row.x)`,
//     writes coerce via `bool ? 1 : 0`.
//   • `handoff_policy` is TEXT (JSON string). Reads go through `safeJsonParse`
//     so a malformed row surfaces as `infra_db_error` rather than throwing.
//
// All errors map to `infra_db_error` to mirror the Pg adapter — no new
// error kinds are introduced.
import { Ok, Err, type Result, type AppError } from '@support/shared'
import type { SiteConfigRow, SiteConfigStorePort } from '../../../application/ports'

type Row = Readonly<{
  site_key: string
  site_name: string
  primary_color: string
  llm4agents_api_key_encrypted: string
  agent_model: string
  embedding_model: string
  embedding_dim: number
  system_prompt: string
  mcp_enabled: number
  handoff_policy: string
  admin_online: number
  onboarding_step: number
  onboarding_completed: number
}>

type HandoffPolicy = SiteConfigRow['handoffPolicy']

const DEFAULT_HANDOFF_POLICY: HandoffPolicy = {
  autoOnLowConfidence: true,
  autoOnFrustrationKeywords: [],
  timeoutBeforeRevertMs: 90_000,
  toolEnabled: true,
}

function safeJsonParse<T>(raw: string, label: string): Result<T, AppError> {
  try {
    return Ok(JSON.parse(raw) as T)
  } catch (err) {
    return Err({ kind: 'infra_db_error', cause: `${label} json malformed: ${String(err)}` })
  }
}

function rowToConfig(r: Row): Result<SiteConfigRow, AppError> {
  const policyRes = safeJsonParse<HandoffPolicy>(r.handoff_policy, 'handoff_policy')
  if (!policyRes.ok) return policyRes
  return Ok({
    siteKey: r.site_key,
    siteName: r.site_name,
    primaryColor: r.primary_color,
    llm4agentsApiKeyEncrypted: r.llm4agents_api_key_encrypted,
    agentModel: r.agent_model,
    embeddingModel: r.embedding_model,
    embeddingDim: r.embedding_dim,
    systemPrompt: r.system_prompt,
    mcpEnabled: Boolean(r.mcp_enabled),
    handoffPolicy: policyRes.value,
    adminOnline: Boolean(r.admin_online),
    onboardingStep: r.onboarding_step,
    onboardingCompleted: Boolean(r.onboarding_completed),
  })
}

const SELECT_COLS = `site_key, site_name, primary_color, llm4agents_api_key_encrypted,
       agent_model, embedding_model, embedding_dim, system_prompt,
       mcp_enabled, handoff_policy, admin_online, onboarding_step, onboarding_completed`

export class D1SiteConfigStore implements SiteConfigStorePort {
  constructor(private readonly db: D1Database) {}

  async get(): Promise<Result<SiteConfigRow | null, AppError>> {
    try {
      const row = await this.db
        .prepare(`SELECT ${SELECT_COLS} FROM site_config WHERE id = 1`)
        .first<Row>()
      if (!row) return Ok(null)
      return rowToConfig(row)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async upsertOnboarding(
    input: Partial<SiteConfigRow> & { siteKey: string },
  ): Promise<Result<SiteConfigRow, AppError>> {
    const defaults = {
      siteName: '',
      primaryColor: '#4f46e5',
      llm4agentsApiKeyEncrypted: '',
      agentModel: 'anthropic/claude-sonnet-4',
      embeddingModel: 'openai/text-embedding-3-small',
      embeddingDim: 1536,
      systemPrompt: '',
      mcpEnabled: false,
      handoffPolicy: DEFAULT_HANDOFF_POLICY,
      adminOnline: false,
      onboardingStep: 1,
      onboardingCompleted: false,
    } as const
    const m = { ...defaults, ...input }
    try {
      // ON CONFLICT(id) DO UPDATE — id is always 1, so the upsert collapses
      // to "insert on first call, update thereafter". Mirrors PgSiteConfigStore.
      const insertRes = await this.db
        .prepare(
          `INSERT INTO site_config (
             id, site_key, site_name, primary_color, llm4agents_api_key_encrypted,
             agent_model, embedding_model, embedding_dim, system_prompt,
             mcp_enabled, handoff_policy, admin_online,
             onboarding_step, onboarding_completed, updated_at
           ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             site_key = excluded.site_key,
             site_name = excluded.site_name,
             primary_color = excluded.primary_color,
             llm4agents_api_key_encrypted = excluded.llm4agents_api_key_encrypted,
             agent_model = excluded.agent_model,
             embedding_model = excluded.embedding_model,
             embedding_dim = excluded.embedding_dim,
             system_prompt = excluded.system_prompt,
             mcp_enabled = excluded.mcp_enabled,
             handoff_policy = excluded.handoff_policy,
             admin_online = excluded.admin_online,
             onboarding_step = excluded.onboarding_step,
             onboarding_completed = excluded.onboarding_completed,
             updated_at = datetime('now')`,
        )
        .bind(
          m.siteKey,
          m.siteName,
          m.primaryColor,
          m.llm4agentsApiKeyEncrypted,
          m.agentModel,
          m.embeddingModel,
          m.embeddingDim,
          m.systemPrompt,
          m.mcpEnabled ? 1 : 0,
          JSON.stringify(m.handoffPolicy),
          m.adminOnline ? 1 : 0,
          m.onboardingStep,
          m.onboardingCompleted ? 1 : 0,
        )
        .run()
      if (!insertRes.success) {
        return Err({ kind: 'infra_db_error', cause: insertRes.error ?? 'd1 upsert failed' })
      }
      const row = await this.db
        .prepare(`SELECT ${SELECT_COLS} FROM site_config WHERE id = 1`)
        .first<Row>()
      if (!row) return Err({ kind: 'infra_db_error', cause: 'site_config row missing after upsert' })
      return rowToConfig(row)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async setAdminOnline(online: boolean): Promise<Result<void, AppError>> {
    try {
      const r = await this.db
        .prepare(
          `UPDATE site_config SET admin_online = ?, updated_at = datetime('now') WHERE id = 1`,
        )
        .bind(online ? 1 : 0)
        .run()
      if (!r.success) {
        return Err({ kind: 'infra_db_error', cause: r.error ?? 'd1 update failed' })
      }
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }

  async setOnboardingStep(step: number, completed: boolean): Promise<Result<void, AppError>> {
    try {
      const r = await this.db
        .prepare(
          `UPDATE site_config
             SET onboarding_step = ?, onboarding_completed = ?, updated_at = datetime('now')
             WHERE id = 1`,
        )
        .bind(step, completed ? 1 : 0)
        .run()
      if (!r.success) {
        return Err({ kind: 'infra_db_error', cause: r.error ?? 'd1 update failed' })
      }
      return Ok(undefined)
    } catch (err) {
      return Err({ kind: 'infra_db_error', cause: String(err) })
    }
  }
}
