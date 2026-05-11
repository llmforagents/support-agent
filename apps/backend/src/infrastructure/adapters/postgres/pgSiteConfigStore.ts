import { Ok, Err, type Result, type AppError } from '@support/shared'
import type { SiteConfigRow, SiteConfigStorePort } from '../../../application/ports'
import type { PgPool } from './pool'

type Row = {
  site_key: string; site_name: string; primary_color: string; llm4agents_api_key_encrypted: string;
  agent_model: string; embedding_model: string; embedding_dim: number; system_prompt: string;
  mcp_enabled: boolean; handoff_policy: SiteConfigRow['handoffPolicy']; admin_online: boolean;
  onboarding_step: number; onboarding_completed: boolean;
}

function rowToConfig(r: Row): SiteConfigRow {
  return {
    siteKey: r.site_key, siteName: r.site_name, primaryColor: r.primary_color,
    llm4agentsApiKeyEncrypted: r.llm4agents_api_key_encrypted,
    agentModel: r.agent_model, embeddingModel: r.embedding_model, embeddingDim: r.embedding_dim,
    systemPrompt: r.system_prompt, mcpEnabled: r.mcp_enabled, handoffPolicy: r.handoff_policy,
    adminOnline: r.admin_online, onboardingStep: r.onboarding_step, onboardingCompleted: r.onboarding_completed,
  }
}

export class PgSiteConfigStore implements SiteConfigStorePort {
  constructor(private readonly pool: PgPool) {}

  async get(): Promise<Result<SiteConfigRow | null, AppError>> {
    try {
      const r = await this.pool.query<Row>(`SELECT site_key, site_name, primary_color, llm4agents_api_key_encrypted, agent_model, embedding_model, embedding_dim, system_prompt, mcp_enabled, handoff_policy, admin_online, onboarding_step, onboarding_completed FROM site_config WHERE id = 1`)
      const row = r.rows[0]
      return Ok(row ? rowToConfig(row) : null)
    } catch (err) { return Err({ kind: 'infra_db_error', cause: String(err) }) }
  }

  async upsertOnboarding(input: Partial<SiteConfigRow> & { siteKey: string }): Promise<Result<SiteConfigRow, AppError>> {
    const defaults = {
      siteName: '', primaryColor: '#4f46e5', llm4agentsApiKeyEncrypted: '', agentModel: 'anthropic/claude-sonnet-4',
      embeddingModel: 'openai/text-embedding-3-small', embeddingDim: 1536, systemPrompt: '', mcpEnabled: false,
      handoffPolicy: { autoOnLowConfidence: true, autoOnFrustrationKeywords: [] as string[], timeoutBeforeRevertMs: 90_000, toolEnabled: true },
      adminOnline: false, onboardingStep: 1, onboardingCompleted: false,
    }
    const m = { ...defaults, ...input }
    try {
      const r = await this.pool.query<Row>(
        `INSERT INTO site_config (id, site_key, site_name, primary_color, llm4agents_api_key_encrypted, agent_model, embedding_model, embedding_dim, system_prompt, mcp_enabled, handoff_policy, admin_online, onboarding_step, onboarding_completed)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           site_key = EXCLUDED.site_key, site_name = EXCLUDED.site_name, primary_color = EXCLUDED.primary_color,
           llm4agents_api_key_encrypted = EXCLUDED.llm4agents_api_key_encrypted,
           agent_model = EXCLUDED.agent_model, embedding_model = EXCLUDED.embedding_model,
           embedding_dim = EXCLUDED.embedding_dim, system_prompt = EXCLUDED.system_prompt,
           mcp_enabled = EXCLUDED.mcp_enabled, handoff_policy = EXCLUDED.handoff_policy,
           admin_online = EXCLUDED.admin_online, onboarding_step = EXCLUDED.onboarding_step,
           onboarding_completed = EXCLUDED.onboarding_completed, updated_at = NOW()
         RETURNING site_key, site_name, primary_color, llm4agents_api_key_encrypted, agent_model, embedding_model, embedding_dim, system_prompt, mcp_enabled, handoff_policy, admin_online, onboarding_step, onboarding_completed`,
        [m.siteKey, m.siteName, m.primaryColor, m.llm4agentsApiKeyEncrypted, m.agentModel, m.embeddingModel, m.embeddingDim, m.systemPrompt, m.mcpEnabled, JSON.stringify(m.handoffPolicy), m.adminOnline, m.onboardingStep, m.onboardingCompleted],
      )
      const row = r.rows[0]
      if (!row) return Err({ kind: 'infra_db_error', cause: 'no row' })
      return Ok(rowToConfig(row))
    } catch (err) { return Err({ kind: 'infra_db_error', cause: String(err) }) }
  }

  async setAdminOnline(online: boolean): Promise<Result<void, AppError>> {
    try {
      await this.pool.query(`UPDATE site_config SET admin_online = $1, updated_at = NOW() WHERE id = 1`, [online])
      return Ok(undefined)
    } catch (err) { return Err({ kind: 'infra_db_error', cause: String(err) }) }
  }

  async setOnboardingStep(step: number, completed: boolean): Promise<Result<void, AppError>> {
    try {
      await this.pool.query(`UPDATE site_config SET onboarding_step = $1, onboarding_completed = $2, updated_at = NOW() WHERE id = 1`, [step, completed])
      return Ok(undefined)
    } catch (err) { return Err({ kind: 'infra_db_error', cause: String(err) }) }
  }
}
