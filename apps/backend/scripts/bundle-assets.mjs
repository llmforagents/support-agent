#!/usr/bin/env node
// Combines apps/admin/dist + apps/widget/dist into apps/backend/public/ so
// Workers Static Assets can serve them under support.llm4agents.com.
//
// Layout produced:
//   public/index.html           <- admin SPA entry (root URL serves admin)
//   public/assets/*             <- admin's bundled JS / CSS / fonts
//   public/widget.js            <- widget bundle (shadow-DOM build)
//   public/widget-iframe.js     <- widget bundle (iframe build, if present)
//   public/embed.html           <- widget iframe scaffold
//
// Idempotent: wipes public/ before copying. Run via:
//   pnpm --filter backend run bundle:assets

import { rm, mkdir, cp, stat, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const backendRoot = resolve(here, '..')
const repoRoot = resolve(backendRoot, '../..')
const publicDir = join(backendRoot, 'public')
const adminDist = join(repoRoot, 'apps/admin/dist')
const widgetDist = join(repoRoot, 'apps/widget/dist')

async function exists(p) {
  try { await stat(p); return true } catch { return false }
}

async function main() {
  if (!(await exists(adminDist))) {
    console.error(`✗ apps/admin/dist not found at ${adminDist}`)
    console.error('  Run: pnpm --filter admin build')
    process.exit(1)
  }
  if (!(await exists(widgetDist))) {
    console.error(`✗ apps/widget/dist not found at ${widgetDist}`)
    console.error('  Run: pnpm --filter widget build')
    process.exit(1)
  }

  await rm(publicDir, { recursive: true, force: true })
  await mkdir(publicDir, { recursive: true })

  // Copy admin dist contents to public/ root (index.html + assets/).
  for (const entry of await readdir(adminDist)) {
    await cp(join(adminDist, entry), join(publicDir, entry), { recursive: true })
  }

  // Copy widget bundle files at top-level of public/. The widget build emits
  // widget.js (always) + widget-iframe.js / embed.html (if iframe build is on).
  const widgetFiles = ['widget.js', 'widget-iframe.js', 'embed.html']
  for (const f of widgetFiles) {
    const src = join(widgetDist, f)
    if (await exists(src)) {
      await cp(src, join(publicDir, f))
    }
  }

  // Report sizes for visibility.
  const tree = []
  async function walk(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(p, rel)
      } else {
        const s = await stat(p)
        tree.push({ rel, bytes: s.size })
      }
    }
  }
  await walk(publicDir)
  const total = tree.reduce((acc, f) => acc + f.bytes, 0)
  console.log(`✓ Bundled ${tree.length} files (${(total / 1024).toFixed(1)} KB) into ${publicDir}`)
  for (const f of tree.sort((a, b) => b.bytes - a.bytes).slice(0, 8)) {
    console.log(`  ${(f.bytes / 1024).toFixed(1).padStart(8)} KB  ${f.rel}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err))
  process.exit(1)
})
