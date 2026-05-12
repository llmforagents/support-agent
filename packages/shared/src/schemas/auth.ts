import { z } from 'zod'
import { MIN_PASSWORD_LEN } from '../constants'

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(MIN_PASSWORD_LEN),
})
export type LoginInput = z.infer<typeof LoginSchema>

export const CreateFirstAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(MIN_PASSWORD_LEN),
})
export type CreateFirstAdminInput = z.infer<typeof CreateFirstAdminSchema>

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LEN),
})
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>

export const CompleteOnboardingSchema = z.object({
  siteName: z.string().min(1).max(100),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  // The llm4agents proxy accepts opaque API keys (typically 64-hex-char tokens).
  // Don't lock in a prefix here — formats may evolve and the upstream proxy
  // is the source of truth on validity.
  llm4agentsApiKey: z.string().min(20),
  agentModel: z.string().min(1),
  systemPrompt: z.string().min(10).max(8000),
})
export type CompleteOnboardingInput = z.infer<typeof CompleteOnboardingSchema>
