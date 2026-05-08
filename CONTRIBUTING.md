# Contributing to support-llm4agents

Thank you for your interest in contributing! This document describes how to set up
your development environment, our branch and commit conventions, and how to submit
pull requests.

## Table of contents

1. [Code of conduct](#code-of-conduct)
2. [Getting started](#getting-started)
3. [Branch conventions](#branch-conventions)
4. [Commit conventions](#commit-conventions)
5. [Pull requests](#pull-requests)
6. [Running tests](#running-tests)
7. [Project structure](#project-structure)

---

## Code of conduct

This project is governed by the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
By participating you agree to abide by its terms. Report violations to **<security-email>**.

---

## Getting started

### Prerequisites

- Node.js ≥ 20 (use `.nvmrc`: `nvm use`)
- pnpm ≥ 9 (`npm i -g pnpm`)
- Docker & Docker Compose (for integration tests and the local stack)

### Setup

```bash
git clone https://github.com/<your-org>/support-llm4agents
cd support-llm4agents
nvm use                          # switches to Node 20 (reads .nvmrc)
pnpm install
node scripts/init-env.mjs        # generate .env with strong secrets
docker compose -f docker/docker-compose.yml up -d postgres
pnpm dev:backend &
pnpm dev:admin &
pnpm dev:widget &
```

Open:
- Admin: http://localhost:3000
- Backend API: http://localhost:3001
- Widget preview: http://localhost:3002

### Full audit (before pushing)

```bash
pnpm audit   # typecheck + lint + unit tests + build + integration tests
```

---

## Branch conventions

| Pattern | Purpose |
|---------|---------|
| `feat/<short-description>` | New feature |
| `fix/<short-description>` | Bug fix |
| `refactor/<short-description>` | Refactor with no behaviour change |
| `docs/<short-description>` | Documentation only |
| `chore/<short-description>` | Tooling, CI, dependencies |
| `test/<short-description>` | Test additions / fixes |

Branch off `main`. Rebase (not merge) to stay current.

---

## Commit conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `perf`, `ci`, `build`

**Scopes (examples):** `backend`, `admin`, `widget`, `docker`, `deps`, `a11y`, `i18n`

**Rules:**
- Use the imperative mood: "add feature" not "added feature".
- First line ≤ 72 characters.
- Reference GitHub issues in the footer: `Closes #42`.

---

## Pull requests

1. Create a branch from `main`.
2. Keep PRs focused — one feature/fix per PR.
3. Fill in the PR template completely.
4. All status checks must pass before merging.
5. At least one reviewer approval is required.
6. Squash-merge is preferred for feature branches; merge commits for release branches.

---

## Running tests

```bash
pnpm test:ci          # unit tests (all workspaces)
pnpm test:integration # integration tests (requires Docker)

# Single workspace
pnpm --filter backend test:ci
pnpm --filter admin  test:ci
pnpm --filter widget test:ci
```

---

## Project structure

```
support-llm4agents/
├── apps/
│   ├── backend/   # Hono API — domain, application, infrastructure, presentation
│   ├── admin/     # React admin dashboard (Vite + shadcn/ui)
│   └── widget/    # Preact embed widget + vanilla bootstrap (Vite)
├── packages/
│   └── shared/    # Shared types and utilities
├── docker/        # Dockerfiles + docker-compose
├── scripts/       # Developer tooling scripts
└── docs/
    └── operations/ # Operations documentation
```

Clean Architecture is enforced per app: `domain → application → infrastructure → presentation`.
Ports & Adapters (DI) pattern throughout — no concrete classes in business logic.
