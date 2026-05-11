# E2E

Playwright + axe-core suite running against the live Postgres deploy.

## Prerequisites

- Postgres reachable on `localhost:5432`. The project's docker-compose stack ships one:
  ```sh
  cd docker && docker compose up postgres -d
  ```
  Set `POSTGRES_URL` / `POSTGRES_PASSWORD` in your `.env` so the backend can connect.
- Node 20+, pnpm 9+.
- One-time browser install (downloads ~150MB of Chromium):
  ```sh
  pnpm --filter e2e install-browsers
  ```

## Running

In one terminal, start the full stack:

```sh
pnpm dev:test    # backend (:3001) + admin (:5173) + widget (:5174) concurrently
```

In a second terminal, run the suite:

```sh
pnpm test:e2e
```

Or with the Playwright inspector:

```sh
pnpm --filter e2e test:ui
```

Show the last HTML report:

```sh
pnpm --filter e2e report
```

## Specs

| File | Scope |
|---|---|
| `widgetHappyPath.spec.ts` | visitor chat round-trip |
| `widgetHandoff.spec.ts` | human escalation |
| `widgetA11y.spec.ts` | axe AA scan of every widget state |
| `adminOnboarding.spec.ts` | onboarding wizard |
| `adminInbox.spec.ts` | operator inbox |
| `adminA11y.spec.ts` | axe AA scan of admin |

Tests are sequential (`workers: 1`) because they share a single backend and Postgres.

## Environment flags

The suite reads a few env vars to make CI runs predictable when the
upstream LLM proxy is not configured:

| Var | Effect |
|---|---|
| `BACKEND_URL` | Backend base URL. Defaults to `http://localhost:3001`. |
| `ADMIN_URL` | Admin SPA base URL. Defaults to `http://localhost:5173`. |
| `E2E_SKIP_LLM=1` | Skip assertions that depend on the AI actually answering. The visitor round-trip still runs; the assistant-reply and handoff-detection assertions are suppressed. `adminInbox.spec.ts` skips entirely because the whole flow depends on the AI escalating. |
| `E2E_SKIP_ONBOARDING=1` | Skip `adminOnboarding.spec.ts` unconditionally. The spec also self-skips when an admin already exists (the wizard becomes inaccessible in that case). |

To exercise `adminOnboarding.spec.ts` against the real wizard you need a
virgin DB — see "DB reset between suites" below.

## DB reset between suites

There is no `/test/reset` endpoint — the seed helper is idempotent so reruns are safe
against a populated DB. To get a fresh slate (recommended before a release smoke test):

```sh
cd docker && docker compose down -v && docker compose up postgres -d
```

Then re-run `pnpm dev:test`.
