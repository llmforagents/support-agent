import { serve } from '@hono/node-server'
import { loadEnv } from '@support/shared'
import { createApp } from './infrastructure/http/createApp'
import { composeContainer } from './composition/composeContainer'

async function main(): Promise<void> {
  const env = loadEnv(process.env)
  const container = await composeContainer(env)
  const app = createApp(container)
  const server = serve({ fetch: app.fetch, port: env.PORT })
  container.logger.info({ port: env.PORT }, 'backend listening')
  process.on('SIGTERM', () => { server.close() ; void container.shutdown() })
}

main().catch((err: unknown) => {
  // Boot failed before the logger could be constructed — stderr is the only sink.
  process.stderr.write(`fatal boot error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`)
  process.exit(1)
})
