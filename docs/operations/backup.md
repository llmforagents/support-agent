# Backup & restore

This document describes how to back up and restore the Postgres database that
powers support-llm4agents.

## What needs to be backed up

| Data | Location | Criticality |
|------|----------|-------------|
| Postgres database | Docker volume `pgdata` | Critical — conversations, config, admin credentials |
| `.env` file | Host filesystem | Critical — secrets; store separately and securely |

The widget JS bundle and admin static assets are build artefacts and can be
regenerated from source at any time.

---

## Backup

### 1. pg_dump (recommended)

```bash
# Dump to a compressed file
docker compose -f docker/docker-compose.yml exec postgres \
  pg_dump -U support support_llm4agents \
  | gzip > "backup-$(date +%Y%m%dT%H%M%S).sql.gz"
```

Automate this with a cron job or your hosting provider's backup feature.

### 2. Docker volume snapshot

As a secondary backup, you can stop the stack and copy the volume directory:

```bash
docker compose -f docker/docker-compose.yml stop postgres
sudo cp -r /var/lib/docker/volumes/support-llm4agents_pgdata \
           /backups/pgdata-$(date +%Y%m%dT%H%M%S)
docker compose -f docker/docker-compose.yml start postgres
```

---

## Restore

### From pg_dump

```bash
# Stop the stack to avoid writes during restore
docker compose -f docker/docker-compose.yml stop backend

# Restore
gunzip -c backup-TIMESTAMP.sql.gz \
  | docker compose -f docker/docker-compose.yml exec -T postgres \
      psql -U support support_llm4agents

# Restart
docker compose -f docker/docker-compose.yml start backend
```

### Full disaster recovery

If you need to rebuild from scratch:

```bash
# 1. Start a fresh stack
docker compose -f docker/docker-compose.yml up -d postgres

# 2. Wait for Postgres to be ready
docker compose -f docker/docker-compose.yml exec postgres \
  pg_isready -U support -d support_llm4agents

# 3. Restore the dump
gunzip -c backup-TIMESTAMP.sql.gz \
  | docker compose -f docker/docker-compose.yml exec -T postgres \
      psql -U support support_llm4agents

# 4. Restore your .env (from your secure backup)
cp /path/to/secure/backup/.env .env

# 5. Start remaining services
docker compose -f docker/docker-compose.yml up -d
```

---

## Backup retention

We recommend keeping:
- Daily backups for 7 days.
- Weekly backups for 4 weeks.
- Monthly backups for 12 months.

Consider offsite storage (S3, Backblaze B2, etc.) for critical deployments.

---

## Testing restores

**Always test your backups.** Spin up a second local stack:

```bash
docker compose -f docker/docker-compose.yml -p test-restore up -d postgres
gunzip -c backup-TIMESTAMP.sql.gz \
  | docker compose -f docker/docker-compose.yml -p test-restore exec -T postgres \
      psql -U support support_llm4agents
# Inspect data, then tear down
docker compose -f docker/docker-compose.yml -p test-restore down -v
```
