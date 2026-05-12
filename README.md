# support-llm4agents

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](.nvmrc)
[![Release](https://img.shields.io/github/v/tag/llmforagents/support-agent?sort=semver&label=release)](https://github.com/llmforagents/support-agent/releases)

Open-source AI support agent for any website. Drop-in floating chat widget powered by your llm4agents account, with knowledge-base RAG, MySQL ingest, human handoff, and a WCAG AA admin dashboard. Two deployment paths: self-host on Node + Postgres, or ship to Cloudflare Workers (D1 + Vectorize + R2 + Durable Objects).

> **Status:** `v0.5.2` — production-ready. **481 automated tests** + 6 Playwright E2E specs. **0 known vulnerabilities**. Cloudflare bundle 3.4 MB gzip (well under the 10 MB Workers limit).

> **⚠ Production deployment:** the default `docker-compose.yml` is for local development. Before exposing to the internet, follow [`docs/operations/self-hosting.md`](docs/operations/self-hosting.md) to put a TLS-terminating reverse proxy in front. Never expose the backend on plain HTTP.

## Features

- **Floating chat widget** — Preact 10, dual-build (shadow DOM bootstrap + iframe), Tawk-style trigger, WCAG AA compliant (ARIA roles, focus management, keyboard nav, `prefers-reduced-motion`).
- **One-step embed** — `<script src="https://your-domain/widget.js" data-site-key="...">` before `</body>`.
- **Knowledge-base RAG** — ingest PDF / Markdown / TXT files and MySQL `SELECT` queries (with AST-validated SQL safety). Embeddings + cosine search via pgvector (Postgres) or Cloudflare Vectorize. Idempotent re-ingest via a generation counter; orphan chunks are filtered out at query time.
- **Human handoff** — the AI invokes a `request_human_handoff` tool when escalation is appropriate; admin "online" toggle gates whether the tool is exposed. A 90-second timeout reverts unclaimed handoffs back to AI. Operator UX with claim / release / close, atomic CAS to guard against AI-vs-operator races.
- **Admin dashboard** — 3-column inbox, onboarding wizard, KB sources management (upload, reindex, preview chunks), MySQL connection manager, operator composer. React 19 + Vite 6 + Tailwind 4 + TanStack Query. Spanish UI primary; English secondary.
- **Prometheus metrics** — `/metrics` endpoint (Postgres) or Analytics Engine dataset (Cloudflare). 11 instrumented metric series covering HTTP, chat, LLM cost, ingest lifecycle, and handoff timeouts.
- **Two deployment targets, one codebase** — `STORAGE_DRIVER=postgres` (default) or `STORAGE_DRIVER=cloudflare`. Selected at composition time; application code is identical between targets.
- **Single-tenant** — one install = one website = one admin. Multi-tenant is out of scope.

## Quick start (local)

```bash
git clone https://github.com/llmforagents/support-agent
cd support-agent
node scripts/init-env.mjs                   # generates .env with strong secrets
docker compose -f docker/docker-compose.yml up -d
```

- Admin: http://localhost:3000 (complete the onboarding wizard)
- Backend: http://localhost:3001
- Postgres: 127.0.0.1:5432 (loopback only)

You'll need an `llm4agents` API key (format `sk-proxy-...`) to finish onboarding. The wizard creates the admin, configures the site, and stores the key encrypted with AES-256-GCM (the encryption key comes from `.env`).

After onboarding, paste the snippet shown on the last step into your website's HTML, before `</body>`:

```html
<script src="https://your-domain/widget.js" data-site-key="..."></script>
```

For production deployments with TLS, see [`docs/operations/self-hosting.md`](docs/operations/self-hosting.md).

## Deploy to Cloudflare

This project ships with a Workers-compatible build that uses D1, R2, Vectorize, and Durable Objects in place of Postgres + pgvector + local files + in-process pubsub. Same routes, same admin UI, same widget — different storage layer wired in by `composeContainerCloudflare.ts`.

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

## Metrics

On the Node + Postgres deploy the backend exposes a Prometheus scrape endpoint at `/metrics`:

```sh
curl http://localhost:3001/metrics
```

The endpoint emits:

- `http_requests_total{method,route,status}` and `http_request_duration_seconds{method,route}` — every request, after `requestId` and before auth so 401/403 responses are still counted. UUIDs in the path are collapsed to `:id` to bound label cardinality.
- `chat_messages_total{role}` — visitor / assistant / system_event messages.
- `llm_request_duration_seconds{model}` and `llm_cost_cents{model}` — LLM stream timings and cost (per the model in `site_config.agentModel`).
- `handoff_requests_total{kind,category}` — AI-triggered handoffs (`kind=ai_decision`).
- `handoff_timeout_reverts_total` — sessions auto-reverted from `handoff_requested` back to `active_ai` by the timeout sweeper.
- `ingest_started_total{source_type}`, `ingest_completed_total{source_type,status}`, `ingest_duration_seconds{source_type}`, `ingest_progress_chunks{source_id}` — source ingest lifecycle (PDF / MD / TXT / mysql_query).

Default histogram buckets target sub-second web latencies (5 ms → 10 s).

**Security.** `/metrics` is **unauthenticated by default**. For production, put it behind a reverse-proxy basic-auth, VPN, or firewall rule — Prometheus scrape targets should not be public.

**Cloudflare deploy.** Metrics are emitted to a bound Analytics Engine dataset (`METRICS` binding in `wrangler.toml`). There is no `/metrics` HTTP endpoint on Cloudflare; query the dataset via Cloudflare's Workers Analytics Engine REST API. When the binding is absent (local `wrangler dev`, vitest-pool-workers), the metrics adapter falls back to a no-op.

## Architecture

- **Monorepo** — pnpm 9 workspaces: `apps/backend` (Hono 4), `apps/admin` (React 19 + Vite 6), `apps/widget` (Preact 10 + Vite, dual-build), `packages/shared` (branded types + Zod schemas + Result type + env loader), `e2e` (Playwright 1.59 + axe-core 4.11).
- **Clean Architecture in the backend** — `domain → application → infrastructure → presentation`. All external dependencies are behind a Port interface (see `apps/backend/src/application/ports.ts`); adapters live under `infrastructure/adapters/{postgres,cloudflare,filesystem,memory,llm4agents}`.
- **Dual driver** — Postgres + pgvector + local files + in-process pubsub **OR** Cloudflare D1 + Vectorize + R2 + Durable Objects. Selected via the `STORAGE_DRIVER` env at composition time. Two composition roots: `composeContainerPostgres.ts` (mounted by `src/server.ts`) and `composeContainerCloudflare.ts` (mounted by `src/worker.ts`). Application code is identical across drivers.
- **TypeScript strict everywhere** — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, branded types for domain IDs (`SessionId`, `AdminId`, `ChunkId`, `UsdCents`, ...), `Result<T, E>` for fallible operations, ESLint `--max-warnings 0` across all packages.

## Development

```bash
pnpm install
pnpm dev:backend      # http://localhost:3001
pnpm dev:admin        # http://localhost:3000 (proxies /v1 → backend)
pnpm dev:widget       # http://localhost:3002 (preview iframe)
pnpm dev:test         # all three concurrently — used by Playwright

pnpm typecheck                          # all workspaces
pnpm lint                               # eslint --max-warnings 0
pnpm test:ci                            # unit tests (Node pool)
pnpm test:integration                   # Postgres integration via testcontainers
pnpm --filter backend run test:cf       # Cloudflare integration via vitest-pool-workers
pnpm --filter backend run build:cf      # wrangler dry-run validates the Workers bundle
pnpm audit                              # full chain (no e2e — see below)
```

**End-to-end (Playwright + axe-core)** — see [`e2e/README.md`](e2e/README.md). Runs against a live local stack (Postgres + dev servers); requires `pnpm --filter e2e run install-browsers` once. Not part of `pnpm audit` (user-driven by design).

Test counts at `v0.5.2`:

| Pool | Tests |
|---|---|
| Unit (Node) — backend / shared / admin / widget | 332 + 25 + 13 + 15 = **385** |
| Postgres integration (`testcontainers-postgresql`) | **46** |
| Cloudflare integration (`@cloudflare/vitest-pool-workers`) | **59** |
| Playwright E2E (user-driven) | **6 specs** |

## Documentation

- [`docs/operations/self-hosting.md`](docs/operations/self-hosting.md) — Production deployment with TLS.
- [`docs/operations/backup.md`](docs/operations/backup.md) — Backup & restore.
- [`docs/operations/secrets.md`](docs/operations/secrets.md) — Secret management & rotation.
- [`docs/operations/github-bootstrap.md`](docs/operations/github-bootstrap.md) — Repo + CI bootstrap.
- [`e2e/README.md`](e2e/README.md) — Running the Playwright + axe-core E2E suite.
- [`apps/widget/README.md`](apps/widget/README.md) — Widget build variants + a11y caveat.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Development setup, branch & commit conventions.
- [`SECURITY.md`](.github/SECURITY.md) — Security disclosure.

## Release history

- **`v0.1.0`** ✅ Skeleton + chat without RAG. Backend skeleton, admin onboarding wizard, widget embed, AI replies via `@llmforagents/sdk`.
- **`v0.2.0`** ✅ Knowledge base: PDF / Markdown / TXT ingestion + embeddings + RAG retrieval with cosine similarity over pgvector.
- **`v0.3.0`** ✅ MySQL source (AST-validated SELECT queries, auto-LIMIT, denied-keyword filter) + auto-handoff via LLM tool + operator mode (claim / release / close, 90s timeout revert).
- **`v0.3.1`** ✅ Atomic CAS for AI-triggered handoff race (operator vs AI) + observability cleanup (pino logger in boot path).
- **`v0.4.0`** ✅ Cloudflare adapters: D1 + Vectorize + R2 + Durable Objects. Dual-driver via `STORAGE_DRIVER` env. `encryption.ts` ported to Web Crypto so it runs unchanged on both runtimes.
- **`v0.5.0`** ✅ Prometheus metrics (Postgres `/metrics` + Cloudflare Analytics Engine) + WCAG AA pass (widget + admin) + Playwright E2E suite (6 specs).
- **`v0.5.1`** ✅ Remove the MCP toggle — web support is covered by RAG + MySQL ingest + human handoff; MCP added cost-control surface area we don't want to maintain.
- **`v0.5.2`** ✅ Relicense from MIT to Apache 2.0 (adds explicit patent grant + NOTICE preservation per §4(d)).

## License

Apache 2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
