# Audit Batch 04 — Deployment & Container Hardening

These items reduce the attack surface of the Docker image and default server configuration.

## 1. Prevent secret files from being copied into Docker images

**Files:** `.dockerignore`, `Dockerfile`

The Dockerfile does `COPY . .` in the build stage, but `.dockerignore` does not exclude `.env`, `.env.local`, `.dev.vars`, or `client_secret*.json`.

**Action:** Add `**/.env*`, `**/.dev.vars`, `**/client_secret*.json`, and other secret patterns to `.dockerignore`. Consider using BuildKit secret mounts for any build-time credentials.

---

## 2. Run the Docker container as a non-root user

**File:** `Dockerfile`

The final stage has no `USER` directive and no `HEALTHCHECK`. It runs as root by default.

**Action:** Add a non-root user (`USER bun` or a dedicated UID), drop capabilities, add `HEALTHCHECK`, and consider a read-only rootfs with `/data` as the only writable volume.

---

## 3. Pin Docker base images by digest

**File:** `Dockerfile`

`oven/bun:1.3.14` / `oven/bun:1.3.14-slim` / `node:22-slim` are referenced by mutable tag. Supply-chain compromise could propagate.

**Action:** Pin to SHA256 digests and enable Renovate/Dependabot for digest updates.

---

## 4. Harden default registration behavior

**Files:** `apps/server/src/config.ts`, `docker-compose.yml`

`ALLOW_REGISTRATION` defaults to `true`, so a freshly started server is open to anyone until the first account is created.

**Action:** Ship Docker Compose with `ALLOW_REGISTRATION: "false"` and document that the first registration creates the admin; alternatively add a one-time setup token.
