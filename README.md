# support-llm4agents

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](.nvmrc)
[![Release](https://img.shields.io/github/v/tag/llmforagents/support-agent?sort=semver&label=release)](https://github.com/llmforagents/support-agent/releases)

**Open-source AI support chat for any website.** Drop one `<script>` tag on your page and your visitors get a Tawk-style floating chat — answered by an AI agent that reads your knowledge base, queries your database, and can hand off to a human when needed.

Built on top of your [llm4agents](https://llm4agents.com) account. Ships with everything you need to self-host: chat widget, admin dashboard, knowledge ingestion, operator inbox, metrics. No SaaS dependency beyond your model provider.

```html
<script src="https://support.your-domain.com/widget.js" data-site-key="..." async></script>
```

That's the entire integration.

## What you get

- A **floating chat widget** that drops onto any site with a single `<script>` tag.
- An **admin dashboard** where you upload PDFs, connect MySQL, and watch live conversations.
- An **AI agent** that answers visitor questions from your knowledge base, falls back to a human operator when it can't help, and stays out of the way the rest of the time.

## Features

**For your visitors**

- Friendly floating widget, indigo theme out of the box. Loads in under 5 KB gzipped.
- Streaming AI replies (no waiting for the full response).
- Seamless escalation to a human when the AI decides it can't help — visitor just keeps chatting in the same window.
- Works on any site, framework-agnostic. Renders inside a shadow DOM so it never touches your CSS.
- Fully accessible: keyboard navigation, screen readers, `prefers-reduced-motion`, WCAG AA contrast.

**For you, the admin**

- One-step onboarding wizard creates your account, configures the site, encrypts your `llm4agents` API key.
- Upload **PDFs, Markdown, and plain text** as knowledge sources. The widget answers from them via RAG.
- Connect a **MySQL database** and let the agent run validated `SELECT` queries — perfect for "where's my order?" style questions.
- **3-column live inbox** to claim conversations, send operator messages, release back to AI, or close.
- Online/offline toggle: when you're offline the AI handles everything; when you're online it can escalate to you.
- All UI in Spanish; English keys are also bundled.

**Under the hood**

- Two deployment paths, same codebase: **Node + Postgres** (self-host with Docker) or **Cloudflare Workers** (D1 + Vectorize + R2 + Durable Objects).
- Prometheus `/metrics` endpoint on the Node path; Cloudflare Analytics Engine on the Workers path.
- Real-time updates via Server-Sent Events. No WebSockets, no polling.
- Single-tenant by design — one install = one site = one admin. Keeps the model simple.

## Quick start — run it locally in 3 minutes

You'll need [Docker](https://docs.docker.com/get-docker/) and Node 20+. That's it.

```bash
git clone https://github.com/llmforagents/support-agent
cd support-agent
node scripts/init-env.mjs          # generates .env with strong random secrets
docker compose -f docker/docker-compose.yml up -d
```

Open **http://localhost:3000** and the onboarding wizard greets you. You'll need an `llm4agents` API key (format `sk-proxy-…`) to finish step 3. Get one at [llm4agents.com](https://llm4agents.com) if you don't have one yet.

After onboarding, the last step shows your embed snippet. Paste it on any site before `</body>` and you're live.

For production self-hosting (TLS, reverse proxy, backups, secrets rotation), see [`docs/operations/self-hosting.md`](docs/operations/self-hosting.md). **Don't expose the backend on plain HTTP** — the onboarding wizard, session cookies, and SSE streams all need TLS.

## Deploy to Cloudflare

If you'd rather skip the Docker setup and run everything serverless on Cloudflare's edge, the project ships ready for it. The same admin UI, the same widget, the same chat — backed by D1, Vectorize, R2, and Durable Objects instead of Postgres + pgvector + local disk.

A single Worker hosts the API **and** serves the admin SPA + widget bundle from the same domain. End user sees one URL, you have one deploy.

### What you'll need

- A Cloudflare account with the domain you want to use as a Zone in your account (e.g. `your-domain.com`).
- `wrangler` (bundled — no need to install globally).
- An `llm4agents` API key for the onboarding wizard.

### Steps

```bash
git clone https://github.com/llmforagents/support-agent
cd support-agent && pnpm install
cd apps/backend

# 1. Authenticate
pnpm exec wrangler login

# 2. Create the storage resources (the D1 id will be printed — copy it)
pnpm exec wrangler d1 create support-llm4agents
pnpm exec wrangler vectorize create support-llm4agents-chunks --dimensions=1536 --metric=cosine
pnpm exec wrangler r2 bucket create support-llm4agents-files

# 3. Paste the D1 id into wrangler.toml -> [[d1_databases]] database_id

# 4. Choose your domain — edit wrangler.toml -> [[routes]] pattern
#    Default is support.llm4agents.com; change to your own subdomain.

# 5. Generate and upload your secrets
pnpm exec wrangler secret put ENCRYPTION_KEY        # openssl rand -hex 32
pnpm exec wrangler secret put COOKIE_SECRET         # openssl rand -base64 36
pnpm exec wrangler secret put STREAM_TOKEN_SECRET   # openssl rand -base64 36

# 6. Build everything and deploy
cd ../.. && pnpm build && pnpm --filter backend run deploy:cf
```

The first deploy automatically provisions the DNS record and a TLS certificate for your custom domain. Give it ~30 seconds, then visit `https://your-subdomain.your-domain.com` and the onboarding wizard appears.

### How the single-domain routing works

The Worker is configured to serve three things from the same hostname:

| Path | Goes to |
|---|---|
| `/v1/*`, `/healthz`, `/readyz`, `/metrics` | Worker (API) |
| `/widget.js`, `/embed.html` | Static asset (widget bundle) |
| `/`, `/login`, `/inbox`, anything else | Static asset (admin SPA, with React Router fallback) |

If you ever want to point a separate subdomain at the widget (e.g. for CDN caching), the bundle is just `https://your-domain.com/widget.js` — feel free to cache it elsewhere.

### Limitations on Cloudflare

- **MySQL knowledge sources aren't supported on Cloudflare** — the `mysql2` driver doesn't run in the Workers runtime. The route layer returns a friendly 422 if you try to create one. If you need MySQL ingest, use the Node + Postgres deploy instead.
- The handoff-timeout sweeper runs as a Durable Object alarm with ~1 s jitter (vs Node's exact `setInterval`). In practice, indistinguishable.
- Everything else — embeddings, KB ingest, chat, handoff, metrics — works identically.

## Embed the widget on your site

After onboarding (either deploy), you'll see a snippet like this on the last step of the wizard:

```html
<script src="https://your-domain.com/widget.js" data-site-key="abc123xyz456abc123xy" async></script>
```

Paste it before `</body>` on any page where you want the chat. The widget:

- Loads asynchronously — never blocks your page render.
- Renders inside a shadow DOM — won't conflict with your CSS.
- Auto-detects locale (defaults to Spanish, falls back gracefully).
- Is keyboard-accessible from the trigger button.

### Customizing the look

The widget's primary color is set during onboarding and ships in `site_config`. To change it later, log into the admin and update it under **Configuración → Apariencia** (coming soon — for now, edit the row in `site_config` directly).

## How it works

A high-level mental model in 4 boxes:

```
┌────────────────────┐    ┌────────────────────────────────────────┐
│  Visitor's browser │    │             Your deployment            │
│                    │    │                                         │
│  widget.js         │───►│  ┌──────────┐  ┌──────────────────┐    │
│  (Preact, shadow)  │ ◄──┤  │   Hono   │  │  Embeddings +    │    │
│                    │ SSE│  │ backend  │◄►│  Vector store    │    │
└────────────────────┘    │  └────┬─────┘  └──────────────────┘    │
                          │       │                                 │
┌────────────────────┐    │  ┌────▼─────┐  ┌──────────────────┐    │
│  Admin's browser   │───►│  │ Admin SPA│  │  llm4agents      │    │
│                    │ ◄──┤  │ (React)  │  │  proxy (LLM API) │    │
│                    │SSE │  └──────────┘  └──────────────────┘    │
└────────────────────┘    └────────────────────────────────────────┘
```

- **The widget** is a tiny Preact app loaded via shadow DOM, talking to the backend over fetch + SSE.
- **The backend** is a Hono app — runs as Node + Postgres, or as a Cloudflare Worker + D1 + Vectorize + R2 + Durable Objects. Same code, different adapters wired in at composition time via `STORAGE_DRIVER=postgres` or `cloudflare`.
- **The admin** is a React 19 + Vite SPA. On Cloudflare deploys it's served as static assets from the same worker.
- **The LLM** is your `llm4agents` account — chat completions for the agent, embeddings for the knowledge base. Your key is encrypted with AES-256-GCM and stored in the database.

The codebase follows Clean Architecture per app: `domain → application → infrastructure → presentation`. External dependencies (databases, file stores, LLMs, the broadcast hub) live behind a port interface; adapters under `apps/backend/src/infrastructure/adapters/{postgres,cloudflare,filesystem,memory}` swap in based on the driver. If you want to add a new backend (Supabase, SQLite, whatever), implement the ports and you're done.

## Observability

The Node + Postgres deploy exposes a Prometheus scrape endpoint at `/metrics`:

```bash
curl http://localhost:3001/metrics
```

You get metrics for every interesting axis:

| Metric | What it tells you |
|---|---|
| `http_requests_total`, `http_request_duration_seconds` | Request rate, latency p50/p95/p99, per route + method + status |
| `chat_messages_total{role}` | Throughput by visitor / assistant / system_event |
| `llm_request_duration_seconds`, `llm_cost_cents` | LLM stream timings + cost, labelled by model |
| `handoff_requests_total`, `handoff_timeout_reverts_total` | How often the AI escalates + how often nobody picks up |
| `ingest_*` | Source ingest lifecycle (started / completed / duration / progress) |

The endpoint is **unauthenticated by default** so it scrapes cleanly. Put it behind a reverse proxy or firewall rule for anything that's not on a private network.

On Cloudflare, the same metrics are emitted to a bound **Analytics Engine** dataset (`METRICS` binding in `wrangler.toml`). Query them via the [Workers Analytics Engine REST API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/).

## Development

If you want to hack on this:

```bash
pnpm install

# Run everything with hot reload (in 3 terminals or via dev:test)
pnpm dev:backend      # http://localhost:3001
pnpm dev:admin        # http://localhost:3000 (proxies /v1 → backend)
pnpm dev:widget       # http://localhost:3002

# Or all three concurrently
pnpm dev:test

# Quality gates
pnpm typecheck
pnpm lint
pnpm test:ci                            # unit tests
pnpm test:integration                   # uses testcontainers Postgres — needs Docker
pnpm --filter backend run test:cf       # Cloudflare adapter tests (miniflare)
pnpm --filter backend run build:cf      # validates the Workers bundle
pnpm audit                              # the full chain above
```

For end-to-end browser tests (Playwright + axe-core), see [`e2e/README.md`](e2e/README.md).

The codebase is a pnpm workspace:

```
apps/backend     # Hono server, all the business logic + adapters
apps/admin       # React 19 + Vite SPA
apps/widget      # Preact 10 + Vite, dual-build (shadow DOM + iframe)
packages/shared  # Branded types, Zod schemas, Result type, env loader
e2e              # Playwright + axe-core
```

Pull requests welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for branch + commit conventions.

## Documentation

- [Self-hosting with TLS](docs/operations/self-hosting.md) — production deployment, reverse proxy setup.
- [Backup & restore](docs/operations/backup.md) — Postgres + R2 backup strategies.
- [Secret management](docs/operations/secrets.md) — rotating encryption keys, cookie secrets.
- [GitHub bootstrap](docs/operations/github-bootstrap.md) — setting up a fork for CI/CD.
- [Running the E2E suite](e2e/README.md) — Playwright + axe-core against a live local stack.
- [Widget build variants](apps/widget/README.md) — shadow DOM vs iframe, accessibility caveats.
- [Security disclosure](.github/SECURITY.md).

## Release history

- **`v0.5.2`** Relicensed under Apache 2.0 (adds patent grant + NOTICE preservation).
- **`v0.5.1`** Removed the MCP toggle — RAG + MySQL ingest + handoff cover the support use case.
- **`v0.5.0`** Prometheus metrics, WCAG AA accessibility pass, Playwright E2E suite.
- **`v0.4.0`** Cloudflare deployment: D1 + Vectorize + R2 + Durable Objects. Dual-driver via `STORAGE_DRIVER` env.
- **`v0.3.1`** Atomic CAS guard for the AI-vs-operator handoff race.
- **`v0.3.0`** MySQL knowledge source + auto-handoff via LLM tool call + operator inbox.
- **`v0.2.0`** Knowledge base: PDF/Markdown/TXT ingestion + embeddings + RAG retrieval.
- **`v0.1.0`** First release — chat widget + admin onboarding + AI replies.

## License

Apache 2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

---

Built by and for the [llm4agents](https://llm4agents.com) community. Issues, PRs, and questions welcome.
