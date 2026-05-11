# support-llm4agents

[![CI](https://github.com/<your-org>/support-llm4agents/actions/workflows/ci.yml/badge.svg)](https://github.com/<your-org>/support-llm4agents/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](.nvmrc)

Open-source AI support agent for any website. Drop-in floating chat widget powered by your llm4agents account, with knowledge-base RAG (P2), human handoff (P3), and a clean admin dashboard.

> **Status:** Phase 1 (`v0.1.0`) — chat widget + admin onboarding + AI replies via llm4agents SDK. Knowledge base, MySQL ingestion, and human handoff land in P2/P3.

> **⚠ Production deployment:** the default `docker-compose.yml` is for local development. Before exposing to the internet, follow [`docs/operations/self-hosting.md`](docs/operations/self-hosting.md) to put a TLS-terminating reverse proxy in front. Never expose the backend on plain HTTP.

## What's in v0.1.0

- Floating chat widget (Tawk-style, friendly indigo theme).
- One-step embed: paste a `<script>` tag on your site.
- Admin dashboard at `/admin/conversations` (3-column inbox layout).
- Onboarding wizard creates the admin user, configures the site, and stores the llm4agents API key encrypted.
- AI streams replies via the `@llmforagents/sdk` (chat + embeddings).
- Single-tenant: one install = one website = one admin.

## Quick start (local)

```bash
git clone https://github.com/<your-org>/support-llm4agents
cd support-llm4agents
node scripts/init-env.mjs                   # generates .env with strong secrets
docker compose -f docker/docker-compose.yml up -d
```

- Admin: http://localhost:3000 (complete the onboarding wizard)
- Backend: http://localhost:3001
- Postgres: 127.0.0.1:5432 (loopback only)

After onboarding, paste the snippet shown on the last step into your website's HTML, before `</body>`:

```html
<script src="https://your-domain/widget.js" data-site-key="..."></script>
```

For production deployments with TLS, see [`docs/operations/self-hosting.md`](docs/operations/self-hosting.md).

## Deploy to Cloudflare

This project ships with a Workers-compatible build that uses D1, R2, Vectorize, and Durable Objects in place of Postgres + pgvector + local files + in-process pubsub.

```bash
# 1. Install wrangler if you don't have it
pnpm add -g wrangler

# 2. Create the D1 database (the id goes into wrangler.toml)
wrangler d1 create support-llm4agents

# 3. Create the Vectorize index (dimension must match your embedding model)
wrangler vectorize create support-llm4agents-chunks --dimensions=1536 --metric=cosine

# 4. Create the R2 bucket
wrangler r2 bucket create support-llm4agents-files

# 5. Put the database_id wrangler printed in `apps/backend/wrangler.toml`
# 6. Put your secrets
wrangler secret put ENCRYPTION_KEY        # 32-byte hex (openssl rand -hex 32)
wrangler secret put COOKIE_SECRET         # 32+ char string
wrangler secret put STREAM_TOKEN_SECRET   # 32+ char string

# 7. Deploy
cd apps/backend && pnpm dlx wrangler deploy
```

**Limitations on Cloudflare:**

- **MySQL data sources are not supported** (the `mysql2` driver isn't compatible with the Workers runtime). The route layer returns a 422 with `mysql_unsupported_on_driver` if you try to create one. Use the Postgres deployment if you need MySQL ingest.
- The handoff timeout runs as a Durable Object alarm, so the cadence may have ~1s jitter vs. the Node `setInterval`.
- Embeddings, KB ingest, and chat all work the same as on the Node path.

## Architecture

- pnpm workspaces monorepo (`apps/backend`, `apps/admin`, `apps/widget`, `packages/shared`).
- Backend: Hono + Postgres (default driver). Cloudflare adapter (D1 + Vectorize + R2) lands in P4.
- Clean Architecture: domain → application → infrastructure → presentation per app.
- Ports & Adapters (Pattern 11): every external dependency goes through an interface.

## Development

```bash
pnpm install
pnpm dev:backend      # http://localhost:3001
pnpm dev:admin        # http://localhost:3000 (proxies /v1 → backend)
pnpm dev:widget       # http://localhost:3002 (preview iframe)
pnpm audit            # typecheck + lint + test:ci + build + test:integration
```

Integration tests use `@testcontainers/postgresql` — Docker is required.

## Documentation

- [`docs/operations/self-hosting.md`](docs/operations/self-hosting.md) — Production deployment with TLS.
- [`docs/operations/backup.md`](docs/operations/backup.md) — Backup & restore.
- [`docs/operations/secrets.md`](docs/operations/secrets.md) — Secret management & rotation.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Development setup, branch & commit conventions.
- [`SECURITY.md`](.github/SECURITY.md) — Security disclosure.

## Roadmap

- **P1 (v0.1.0)** ✅ Skeleton + chat without RAG.
- **P2 (v0.2.0)** Knowledge base: PDF/md/txt ingestion + embeddings + RAG retrieval.
- **P3 (v0.3.0)** MySQL source + auto-handoff + operator mode.
- **P4 (v0.4.0)** MCP toggle + metrics + Cloudflare adapters + WCAG AA polish.

## License

MIT — see LICENSE.
