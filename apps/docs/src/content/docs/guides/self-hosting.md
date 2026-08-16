---
title: Self-hosting guide
description: Deploy DeviceSDK on your own server with Docker, configure a reverse proxy, TLS, backups, and multi-server LAN setups
sidebar:
  order: 5
---


DeviceSDK ships as a single Docker image that serves the API, WebSocket endpoint, and dashboard from one port. This guide covers a production-grade self-hosted setup: reverse proxy, HTTPS, backups, and multi-server LAN configurations.

## Prerequisites

- A host running Docker (Linux recommended). Works on a home server, NUC, Raspberry Pi 4/5, VPS, or any VM.
- Ports 80 and 443 reachable from your clients (or just the LAN port if you skip TLS for a private network install).
- A domain name pointing at the host (required for HTTPS).

## Quick start

```bash
# Named volume for the SQLite database and scripts. A bind mount also works,
# but the container runs as uid 1000 - with a bind mount you must `chown
# 1000:1000` the directory first or the container cannot write to it.
docker volume create devicesdk-data

docker run -d \
  --name devicesdk \
  --restart unless-stopped \
  -p 8080:8080 \
  -v devicesdk-data:/data \
  -e ALLOW_REGISTRATION=false \
  ghcr.io/device-sdk/devicesdk:latest
```

Open `http://localhost:8080` - the first visit creates the admin account. After that, `ALLOW_REGISTRATION=false` prevents further sign-ups.

## Docker Compose (recommended)

Save this as `docker-compose.yml` and run `docker compose up -d`:

```yaml
services:
  devicesdk:
    image: ghcr.io/device-sdk/devicesdk:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - devicesdk-data:/data
    environment:
      ALLOW_REGISTRATION: "false"
      # Plain HTTP on the LAN: browsers drop Secure cookies, so keep this
      # "false" here and flip it to "true" behind an HTTPS reverse proxy.
      SECURE_COOKIES: "false"

volumes:
  devicesdk-data:
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP port the server listens on |
| `DATA_DIR` | `./data` | Root for SQLite DB, scripts, firmware |
| `ALLOW_REGISTRATION` | `true` | Allow new account sign-ups |
| `SECURE_COOKIES` | `false` | Set `Secure` flag on session cookies - **must be `true` behind TLS** |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-For` headers - enable only behind a reverse proxy |
| `API_TOKEN_SECRET` | auto-generated | HMAC secret for token hashing. Auto-generated and persisted to `DATA_DIR/.api-token-secret` on first start; override for multi-instance or reproducible deployments |
| `MDNS_ENABLED` | `true` | Advertise server over mDNS for device auto-discovery |
| `MDNS_HOSTNAME` | `devicesdk` | mDNS short hostname (devices reach `devicesdk.local`) |
| `LOG_FILE` | `DATA_DIR/server.log` | Server log path |

## Reverse proxy and HTTPS/TLS

For LAN-only installs you can skip TLS, but for anything reachable from the internet you **must** terminate TLS at a reverse proxy.

### Caddy (simplest - automatic TLS)

```caddyfile
devicesdk.example.com {
  reverse_proxy localhost:8080
}
```

Caddy auto-provisions and renews Let's Encrypt certificates. No other TLS config needed.

### nginx

```nginx
server {
    listen 443 ssl;
    server_name devicesdk.example.com;

    ssl_certificate     /etc/ssl/certs/devicesdk.crt;
    ssl_certificate_key /etc/ssl/private/devicesdk.key;

    # WebSocket upgrade for device connections
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }
}

server {
    listen 80;
    server_name devicesdk.example.com;
    return 301 https://$host$request_uri;
}
```

After adding the reverse proxy, set `TRUST_PROXY=true` and `SECURE_COOKIES=true` in your container environment.

### Let's Encrypt with Certbot

```bash
certbot certonly --standalone -d devicesdk.example.com
```

Then reference the generated files from your nginx/Apache config. Certbot renews certificates automatically via a systemd timer or cron job.

## Backups

All persistent state lives in the `devicesdk-data` volume mounted at `/data` in the container. A hot SQLite backup is safe to take while the server is running. The one-off helper containers below run as root so the backup files on the host are host-readable (the volume itself is owned by the container's uid 1000).

If you used a host bind mount instead (`-v ~/devicesdk-data:/data`, `chown`ed as shown in the quick start), the container networking is unnecessary: run the `sqlite3` commands directly against `~/devicesdk-data` on the host (`sqlite3 ~/devicesdk-data/devicesdk.sqlite ".backup ..."`), or `cp -r ~/devicesdk-data` after stopping the container.

### Hot backup (online, safe while running)

```bash
mkdir -p ./backups

# VACUUM INTO writes a consistent database snapshot even with WAL active.
docker run --rm -u root \
  -v devicesdk-data:/data \
  -v "$PWD/backups:/backups" \
  ghcr.io/device-sdk/devicesdk:latest \
  bun -e 'const { Database } = require("bun:sqlite"); const d = new Database("/data/devicesdk.sqlite"); const out = "/backups/devicesdk-" + process.argv[1] + ".sqlite"; d.query("VACUUM INTO ?1").get(out); console.log("Backup written to " + out);' \
  "$(date +%Y%m%d-%H%M%S)"
```

### Cold backup (stop the container, copy the whole data directory)

```bash
mkdir -p ./backups
docker stop devicesdk

docker run --rm -u root \
  -v devicesdk-data:/data \
  -v "$PWD/backups:/backups" \
  ghcr.io/device-sdk/devicesdk:latest \
  cp -r /data "/backups/devicesdk-data-$(date +%Y%m%d)"

docker start devicesdk
```

### Restore

Stop the container, replace the volume contents with the backup, and restart. Replacing the whole data directory (not just the SQLite file) also restores `DATA_DIR/.api-token-secret`, so previously minted tokens stay valid.

```bash
docker stop devicesdk

# From a hot backup (single SQLite file)
docker run --rm -u root \
  -v devicesdk-data:/data \
  -v "$PWD/backups:/backups" \
  ghcr.io/device-sdk/devicesdk:latest \
  sh -c 'rm -f /data/devicesdk.sqlite /data/devicesdk.sqlite-wal /data/devicesdk.sqlite-shm && cp /backups/devicesdk-20240101-020000.sqlite /data/devicesdk.sqlite && chown bun:bun /data/devicesdk.sqlite'

# From a cold backup (whole data directory)
docker run --rm -u root \
  -v devicesdk-data:/data \
  -v "$PWD/backups:/backups" \
  ghcr.io/device-sdk/devicesdk:latest \
  sh -c 'find /data -mindepth 1 -delete && cp -a /backups/devicesdk-data-20240101/. /data/ && chown -R bun:bun /data'

docker start devicesdk
```

Replace `devicesdk-20240101-020000.sqlite` / `devicesdk-data-20240101` with the actual backup names.

### Schedule with cron

Save the hot-backup command as a script so the cron line stays readable:

```bash
cat > /usr/local/bin/devicesdk-backup.sh <<'EOF'
#!/bin/sh
docker run --rm -u root \
  -v devicesdk-data:/data \
  -v /backups:/backups \
  ghcr.io/device-sdk/devicesdk:latest \
  bun -e 'const { Database } = require("bun:sqlite"); const d = new Database("/data/devicesdk.sqlite"); const out = "/backups/devicesdk-" + process.argv[1] + ".sqlite"; d.query("VACUUM INTO ?1").get(out);' \
  "$(date +%Y%m%d-%H%M%S)"
EOF
chmod +x /usr/local/bin/devicesdk-backup.sh
```

```cron
0 3 * * * /usr/local/bin/devicesdk-backup.sh
```

## Multi-server LAN considerations

You can run multiple DeviceSDK servers on the same LAN. Each server is independent - devices connect to exactly one server.

### mDNS hostnames

By default each server advertises itself as `devicesdk.local`. To avoid conflicts, give each server a unique hostname:

```yaml
environment:
  MDNS_HOSTNAME: "devicesdk-lab"    # → lab.local
```

Devices will discover the correct server at `devicesdk-lab.local`.

### Shared network storage

If you mount `DATA_DIR` on a network share (NFS, SMB) shared by multiple servers, each server must have its own subdirectory and **must not share the SQLite file**. SQLite does not support concurrent writes from multiple processes across a network filesystem.

### `API_TOKEN_SECRET`

HMAC token hashes are keyed with `API_TOKEN_SECRET`. If you run two servers, do **not** share the same secret - tokens issued by one server must not be accepted by the other. Each server auto-generates a unique secret and persists it under `DATA_DIR/.api-token-secret`.

## Updating

```bash
docker compose pull
docker compose up -d
```

The server applies database migrations on startup automatically.

## Firewall recommendations

| Port | Protocol | Purpose | Expose to |
|---|---|---|---|
| 8080 (or your proxy port) | TCP | API + dashboard + WS | LAN or internet (behind TLS) |
| 443 | TCP | HTTPS (reverse proxy) | Internet |
| 5353 | UDP | mDNS device discovery | LAN only |

Close port 8080 on the internet-facing interface if you use a reverse proxy on 443.
