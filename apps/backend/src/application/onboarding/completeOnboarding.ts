import { randomBytes } from 'node:crypto'
import { type Result, type AppError, type CompleteOnboardingInput, DEFAULT_EMBEDDING_DIM, DEFAULT_EMBEDDING_MODEL } from '@support/shared'
import type { SiteConfigRow, SiteConfigStorePort } from '../ports'

export type CompleteOnboardingDeps = Readonly<{
  siteConfigStore: SiteConfigStorePort
  encrypt: (plaintext: string) => string
}>

function generateSiteKey(): string {
  return randomBytes(15).toString('base64url').slice(0, 20)
}

export async function completeOnboarding(
  deps: CompleteOnboardingDeps,
  input: CompleteOnboardingInput,
): Promise<Result<SiteConfigRow, AppError>> {
  const existing = await deps.siteConfigStore.get()
  if (!existing.ok) return existing
  const siteKey = existing.value?.siteKey ?? generateSiteKey()
  const encrypted = deps.encrypt(input.llm4agentsApiKey)
  return deps.siteConfigStore.upsertOnboarding({
    siteKey,
    siteName: input.siteName,
    primaryColor: input.primaryColor,
    llm4agentsApiKeyEncrypted: encrypted,
    agentModel: input.agentModel,
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    embeddingDim: DEFAULT_EMBEDDING_DIM,
    systemPrompt: input.systemPrompt,
    mcpEnabled: false,
    handoffPolicy: { autoOnLowConfidence: true, autoOnFrustrationKeywords: [], timeoutBeforeRevertMs: 90_000, toolEnabled: true },
    onboardingStep: 9,
    onboardingCompleted: true,
  })
}
