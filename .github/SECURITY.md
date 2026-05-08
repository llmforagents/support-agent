# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `main`  | ✅        |
| < 0.1.0 | ❌        |

## Reporting a vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities by sending an e-mail to **<security-email>** with the subject
`[support-llm4agents] Security disclosure`.

Include as much detail as possible:

- Description of the vulnerability and its potential impact.
- Steps to reproduce (proof-of-concept, screenshots, logs).
- Affected component(s) and version(s).
- Any mitigations you are aware of.

You will receive a confirmation within **48 hours** and a status update within **7 days**.
We follow responsible disclosure: if you give us 90 days to ship a fix we will credit you
in the release notes.

## Scope

In scope:
- `apps/backend` — HTTP API and business logic
- `apps/admin` — Admin dashboard
- `apps/widget` — Embedded chat widget
- `docker/` — Container configuration
- `scripts/` — Tooling scripts

Out of scope:
- Third-party dependencies (report upstream)
- Issues already fixed in `main`
- Theoretical vulnerabilities with no demonstrated impact

## Security best practices for operators

- Run behind a TLS-terminating reverse proxy. See [`docs/operations/self-hosting.md`](../docs/operations/self-hosting.md).
- Rotate secrets regularly. See [`docs/operations/secrets.md`](../docs/operations/secrets.md).
- Keep Docker base images up to date (Dependabot PRs are sent automatically).
- Enable branch protection and secret scanning on your GitHub fork.
