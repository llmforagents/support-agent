import { LLM4AgentsClient } from '@llmforagents/sdk'
import { Ok, Err, type Result, type AppError } from '@support/shared'
import type { EmbedderPort } from '../../../application/ports'

export type EmbedderClientFactory = (apiKey: string, apiBase?: string) => InstanceType<typeof LLM4AgentsClient>

const realFactory: EmbedderClientFactory = (apiKey, apiBase) =>
  new LLM4AgentsClient({ apiKey, ...(apiBase ? { baseUrl: apiBase } : {}) })

export class Llm4AgentsEmbedderAdapter implements EmbedderPort {
  constructor(
    public readonly model: string,
    public readonly dimension: number,
    private readonly apiBase?: string,
    private readonly factory: EmbedderClientFactory = realFactory,
  ) {}

  async embed(texts: readonly string[], apiKey: string): Promise<Result<readonly (readonly number[])[], AppError>> {
    if (texts.length === 0) return Ok([])
    try {
      const client = this.factory(apiKey, this.apiBase)
      const res = await client.embeddings.create({
        model: this.model,
        input: texts as string[],
      })
      const vectors = res.data.map((d) => d.embedding as readonly number[])
      return Ok(vectors)
    } catch (err) {
      return Err({ kind: 'embedding_provider_failed', cause: String(err) })
    }
  }
}
