import { z } from 'zod'
import { MAX_VISITOR_MESSAGE_LEN } from '../constants'

export const CreateSessionSchema = z.object({
  url: z.string().url().optional(),
  userAgent: z.string().max(500).optional(),
  language: z.string().max(20).optional(),
})
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>

export const PostMessageSchema = z.object({
  content: z.string().min(1).max(MAX_VISITOR_MESSAGE_LEN),
})
export type PostMessageInput = z.infer<typeof PostMessageSchema>
