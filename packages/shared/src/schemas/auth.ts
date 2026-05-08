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

export const CompleteOnboardingSchema = z.object({
  siteName: z.string().min(1).max(100),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  llm4agentsApiKey: z.string().regex(/^sk-proxy-/),
  agentModel: z.string().min(1),
  systemPrompt: z.string().min(10).max(8000),
})
export type CompleteOnboardingInput = z.infer<typeof CompleteOnboardingSchema>
