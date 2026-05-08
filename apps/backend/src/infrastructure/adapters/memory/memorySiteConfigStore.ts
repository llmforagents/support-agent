import { Ok, type Result, type AppError } from '@support/shared'
import type { SiteConfigRow, SiteConfigStorePort } from '../../../application/ports'

export class MemorySiteConfigStore implements SiteConfigStorePort {
  private row: SiteConfigRow | null = null

  get(): Promise<Result<SiteConfigRow | null, AppError>> {
    return Promise.resolve(Ok(this.row))
  }

  upsertOnboarding(input: Partial<SiteConfigRow> & { siteKey: string }): Promise<Result<SiteConfigRow, AppError>> {
    const merged: SiteConfigRow = {
      siteKey: input.siteKey,
      siteName: input.siteName ?? this.row?.siteName ?? '',
      primaryColor: input.primaryColor ?? this.row?.primaryColor ?? '#4f46e5',
      llm4agentsApiKeyEncrypted: input.llm4agentsApiKeyEncrypted ?? this.row?.llm4agentsApiKeyEncrypted ?? '',
      agentModel: input.agentModel ?? this.row?.agentModel ?? 'anthropic/claude-sonnet-4',
      embeddingModel: input.embeddingModel ?? this.row?.embeddingModel ?? 'openai/text-embedding-3-small',
      embeddingDim: input.embeddingDim ?? this.row?.embeddingDim ?? 1536,
      systemPrompt: input.systemPrompt ?? this.row?.systemPrompt ?? '',
      mcpEnabled: input.mcpEnabled ?? this.row?.mcpEnabled ?? false,
      handoffPolicy: input.handoffPolicy ?? this.row?.handoffPolicy ?? {
        autoOnLowConfidence: true, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90_000, toolEnabled: true,
      },
      adminOnline: input.adminOnline ?? this.row?.adminOnline ?? false,
      onboardingStep: input.onboardingStep ?? this.row?.onboardingStep ?? 1,
      onboardingCompleted: input.onboardingCompleted ?? this.row?.onboardingCompleted ?? false,
    }
    this.row = merged
    return Promise.resolve(Ok(merged))
  }

  setAdminOnline(online: boolean): Promise<Result<void, AppError>> {
    if (this.row) this.row = { ...this.row, adminOnline: online }
    return Promise.resolve(Ok(undefined))
  }

  setOnboardingStep(step: number, completed: boolean): Promise<Result<void, AppError>> {
    if (this.row) this.row = { ...this.row, onboardingStep: step, onboardingCompleted: completed }
    return Promise.resolve(Ok(undefined))
  }
}
