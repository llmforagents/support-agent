import { serve } from '@hono/node-server'
import { loadEnv } from '@support/shared'
import { createApp } from './infrastructure/http/createApp'
import { composeContainer } from './composition/composeContainer'

async function main(): Promise<void> {
  const env = loadEnv(process.env)
  const container = await composeContainer(env)
  const app = createApp(container)
  const server = serve({ fetch: app.fetch, port: env.PORT })
  console.log(`backend listening on :${env.PORT}`)
  process.on('SIGTERM', () => { server.close() ; void container.shutdown() })
}

main().catch((err) => {
  console.error('fatal boot error', err)
  process.exit(1)
})
