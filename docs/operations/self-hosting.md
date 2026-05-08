# Self-hosting with TLS

The default `docker/docker-compose.yml` binds the backend on `localhost:3001` and
the admin on `localhost:3000`. This is suitable for local development only.
**Never expose the backend on plain HTTP to the internet.**

This document shows how to put a TLS-terminating reverse proxy in front.

---

## Option A — Caddy (recommended for simplicity)

Caddy handles certificate issuance and renewal automatically via Let's Encrypt.

### 1. Prerequisites

- A domain name pointing at your server (e.g. `support.example.com`).
- Ports 80 and 443 open in your firewall.
- Docker and Docker Compose installed.

### 2. Caddyfile

Create `Caddyfile` in your deployment directory:

```caddyfile
support.example.com {
    # Admin dashboard
    handle /admin/* {
        reverse_proxy admin:3000
    }
    # Widget embed and API
    handle /embed/* {
        reverse_proxy backend:3001
    }
    handle /v1/* {
        reverse_proxy backend:3001
    }
    handle /widget.js {
        reverse_proxy backend:3001
    }
    # Default: admin
    handle {
        reverse_proxy admin:3000
    }
}
```

### 3. Update docker-compose.yml

Add the Caddy service and put all services on a shared network.
Create `docker/docker-compose.prod.yml`:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ../Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks: [proxy]

  backend:
    networks: [proxy, internal]
    # Remove ports: mapping so it is not accessible directly

  admin:
    networks: [proxy, internal]
    # Remove ports: mapping so it is not accessible directly

  postgres:
    networks: [internal]
    # Never expose postgres to the proxy network

networks:
  proxy:
  internal:
    internal: true

volumes:
  caddy_data:
  caddy_config:
```

Start with:

```bash
docker compose \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.prod.yml \
  up -d
```

---

## Option B — nginx + Certbot

### 1. Install nginx and Certbot

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

### 2. Obtain a certificate

```bash
sudo certbot --nginx -d support.example.com
```

### 3. nginx site config

```nginx
server {
    listen 443 ssl http2;
    server_name support.example.com;

    ssl_certificate     /etc/letsencrypt/live/support.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/support.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Admin dashboard
    location /admin {
        proxy_pass         http://localhost:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
    }

    # Backend API and widget embed
    location ~ ^/(v1|embed|widget\.js) {
        proxy_pass         http://localhost:3001;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
        # SSE support
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 3600s;
    }

    # Default: admin
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name support.example.com;
    return 301 https://$host$request_uri;
}
```

---

## Environment variables for production

Update your `.env` with the public URL:

```env
PUBLIC_URL=https://support.example.com
NODE_ENV=production
```

The `PUBLIC_URL` is embedded in the widget embed snippet shown in the onboarding wizard.

---

## Health checks

After deploying, verify:

```bash
curl -f https://support.example.com/v1/healthz
# Expected: {"status":"ok"}
```

The CI `docker-build` job also validates `docker compose config` syntax on every push.
