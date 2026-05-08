#!/usr/bin/env node
/**
 * init-env.mjs — cross-platform secret initialisation script.
 *
 * Reads `.env.example`, fills in required secrets with cryptographically
 * strong values, writes the result to `.env`. No external deps.
 *
 *   node scripts/init-env.mjs          # create .env (fails if it already exists)
 *   node scripts/init-env.mjs --force  # overwrite existing .env
 */

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')
const ENV_PATH = resolve(ROOT, '.env')
const TEMPLATE_PATH = resolve(ROOT, '.env.example')

const force = process.argv.includes('--force')

if (existsSync(ENV_PATH) && !force) {
  console.error(
    `\n  .env already exists at ${ENV_PATH}\n` +
      '  To overwrite it, run: node scripts/init-env.mjs --force\n',
  )
  process.exit(1)
}

if (!existsSync(TEMPLATE_PATH)) {
  console.error(`\n  .env.example not found at ${TEMPLATE_PATH}\n`)
  process.exit(1)
}

const tpl = readFileSync(TEMPLATE_PATH, 'utf8')

const out = tpl
  .replace(/^ENCRYPTION_KEY=$/m, `ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`)
  .replace(/^STREAM_TOKEN_SECRET=$/m, `STREAM_TOKEN_SECRET=${randomBytes(32).toString('hex')}`)
  .replace(/^COOKIE_SECRET=$/m, `COOKIE_SECRET=${randomBytes(32).toString('hex')}`)
  .replace(/^POSTGRES_PASSWORD=$/m, `POSTGRES_PASSWORD=${randomBytes(24).toString('base64url')}`)

writeFileSync(ENV_PATH, out, { encoding: 'utf8' })

console.log(`\n  .env written to ${ENV_PATH}`)
console.log('  Review and edit PUBLIC_API_URL / ADMIN_ORIGIN before docker compose up.\n')
