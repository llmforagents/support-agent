# Secrets management & rotation

This document describes every secret used by support-llm4agents, where it lives,
and how to rotate it safely.

---

## Secret inventory

| Variable | Purpose | Length | Rotation impact |
|----------|---------|--------|-----------------|
| `JWT_SECRET` | Signs JWT access tokens | 64 hex chars (256 bit) | Invalidates all active sessions |
| `SESSION_SECRET` | Signs session cookies | 64 hex chars | Invalidates all active sessions |
| `ENCRYPTION_KEY` | AES-256 encrypts the llm4agents API key at rest in the DB | 64 hex chars | Requires re-encryption of stored key |
| `DATABASE_URL` | Postgres connection string | — | Update app + backups |
| `LLM4AGENTS_API_KEY` | Stored encrypted in DB (set via onboarding wizard) | — | Update via admin or re-run onboarding |

---

## Generating new secrets

Use the init script with `--force` to regenerate all secrets:

```bash
node scripts/init-env.mjs --force
```

Or generate individual secrets:

```bash
# 64 hex chars (256-bit random)
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex') + '\n')"

# OpenSSL alternative
openssl rand -hex 32
```

---

## Rotating `JWT_SECRET` or `SESSION_SECRET`

These secrets sign authentication tokens. Rotating them **immediately invalidates
all active sessions** — users will be logged out.

1. Generate a new secret (see above).
2. Update `.env`:
   ```env
   JWT_SECRET=<new-secret>
   ```
3. Restart the backend:
   ```bash
   docker compose -f docker/docker-compose.yml restart backend
   ```
4. Inform admin users they will need to log in again.

For zero-downtime rotation, implement a grace period where both old and new secrets
are accepted. This is out of scope for P1 — raise a GitHub issue if you need it.

---

## Rotating `ENCRYPTION_KEY`

The `ENCRYPTION_KEY` is used to encrypt the llm4agents API key stored in Postgres.
Rotating it requires re-encrypting the stored value.

1. Generate a new key.
2. Run the migration helper (P2 feature — not yet implemented; raise an issue if needed).
   As a workaround, re-run the onboarding wizard after updating the key.
3. Update `.env` and restart.

---

## Rotating `DATABASE_URL`

1. Update the Postgres password:
   ```bash
   docker compose -f docker/docker-compose.yml exec postgres \
     psql -U support -c "ALTER USER support WITH PASSWORD 'new-password';"
   ```
2. Update `DATABASE_URL` in `.env`.
3. Restart the backend.

---

## Storing secrets securely

**Do not** commit `.env` to version control.

Options for secret storage:
- **Local / self-hosted**: `.env` file on the host with `chmod 600`. Back it up to an
  encrypted offsite location (e.g. age-encrypted, stored in a password manager, or in a
  secrets manager like Vault or Infisical).
- **Cloud VMs (AWS, GCP, etc.)**: use the provider's Secrets Manager or Parameter Store
  and inject at runtime.
- **Kubernetes**: use `kubectl create secret` + mount as environment variables.
  Never store secrets in ConfigMaps.
- **CI/CD**: use the CI platform's encrypted secret storage (GitHub Actions Secrets,
  GitLab CI Variables, etc.).

---

## Incident response

If a secret is compromised:

1. **Rotate immediately** using the steps above.
2. Inspect logs for signs of misuse.
3. If the llm4agents API key was leaked, invalidate it in the llm4agents dashboard
   and generate a new one.
4. If admin credentials were leaked, reset the admin password via the database:
   ```bash
   docker compose -f docker/docker-compose.yml exec postgres \
     psql -U support support_llm4agents \
     -c "UPDATE admins SET password_hash = '<new-bcrypt-hash>' WHERE email = 'your@email.com';"
   ```
5. Report the incident according to your organisation's security policy.
