# DeviceSDK API — Marketing-Site Content Draft

## One-liner
Secure, Cloudflare-native IoT application platform that lets teams ship, update, and monitor per-device scripts with zero infrastructure management.

## Core value props
- **Fast to market:** Opinionated APIs + CLI to create projects, register devices, and deploy scripts in minutes.
- **Secure by default:** OAuth login, short-lived sessions, hashed CLI tokens, managed API tokens, and per-device credentials baked in.
- **Cloudflare-native performance:** Runs at the edge on Workers with Durable Objects, D1 for data, and R2 for artifact storage.
- **Developer-first:** OpenAPI auto-generated docs, TypeScript-first SDK/CLI, local + CI-friendly workflows.

## Feature highlights
- **Authentication & sessions**
  - Google OAuth 2.0 login, session cookies (`devicesdk-session`), bearer tokens, logout endpoint.
  - CLI-friendly device authorization flow (device & user codes, polling, refresh, revoke).
  - Session + token validation with expiry and hashing for stored tokens.
- **Projects**
  - Create/read/update/delete projects with user-defined slugs, names, and descriptions.
  - Per-user project isolation.
- **Devices**
  - CRUD for devices within projects; auto-creation for backward compatibility.
  - WebSocket connection endpoint per device (via Durable Objects) with version selection.
  - Firmware download endpoint that injects device- and project-specific credentials into bundled firmware.
  - Device metadata: names, descriptions, last_connected_at, current_version_id.
- **Scripts & deployments**
  - Per-device script versions with R2 storage (`/{user}/{project}/{device}/{version}.js`) and `latest.js` pointer.
  - Single-device upload with validation (entrypoint, size limits, linting via `validateUserScript`).
  - Batch upload across devices with atomic validation and auto-device creation.
  - Version history listing and targeted deploy endpoints.
- **Tokens**
  - User-managed API tokens with quotas and deletion.
  - Managed device tokens generated automatically for firmware flashing.
- **User profile**
  - `/v1/user/me` for authenticated user info (id, email, picture, verification status).
- **CLI experience**
  - `@devicesdk/cli` spec: init projects, dev/build/deploy scripts, login/logout/whoami, single/batch deploys, verbose/debug flags.
  - Config file (`devicesdk.ts`) defines projectId and device entrypoints; TS-first DX.

## Platform/architecture notes
- Cloudflare Workers app with Hono + Chanfana (OpenAPI auto-generation & validation).
- Data: D1 database with tables for users, sessions, projects, devices, device_scripts, tokens, CLI auth codes, CLI tokens.
- Edge coordination: Durable Objects per device for WebSocket handling and message routing.
- Storage: R2 buckets for scripts; firmware bucket for downloadable UF2 images.
- CORS configured for dashboard + local dev (`https://dash.devicesdk.com`, `http://localhost:9000`).

## Security & trust
- Tokens stored hashed (SHA-256 for CLI tokens), short-lived sessions, refresh flows.
- Input validation with Zod + OpenAPI schema; request/response validation via Chanfana.
- Rate-limiting guidance for CLI auth flows; max token counts enforced.
- Domain-scoped, secure, SameSite=None cookies; HTTPS-first.

## DX & quality
- OpenAPI doc served at root (`/`) with schema generation (`npm run schema`).
- Integration tests with Vitest + Cloudflare Workers pool; database migrations included.
- Biome formatting + linting; TypeScript everywhere.

## Ideal use cases
- Shipping edge logic to fleets of IoT devices with per-device scripts and fast rollouts.
- Secure CLI-driven developer workflow for hardware teams.
- Multi-device batch deployments with built-in validation and rollback safety.
- Cloudflare-first IoT projects needing WebSocket control channels.

## Quick start (site-friendly)
1) Login with Google → create a project slug.  
2) Register devices (or let uploads auto-create).  
3) Write TS entrypoints, `devicesdk deploy` (single or batch).  
4) Connect devices via WebSocket and flash firmware with injected credentials.  
5) Monitor versions, rotate tokens, and iterate quickly at the edge.

## Notable endpoints (marketing-facing examples)
- `GET /v1/user/me` — auth check & profile.  
- `POST /v1/projects` — create project (slug-based).  
- `GET /v1/projects/:projectId/devices` — fleet inventory.  
- `PUT /v1/projects/:projectId/devices/:deviceId/script` — upload + validate + version.  
- `PUT /v1/projects/:projectId/scripts` — batch deploy.  
- `GET /v1/projects/:projectId/devices/:deviceId/connect/websocket` — live control.  
- `POST /v1/projects/:projectId/devices/:deviceId/firmware` — download firmware with device creds.  
- `POST /v1/tokens` / `DELETE /v1/tokens/:tokenId` — manage API tokens.  
- CLI auth flow: `/v1/cli/auth/start`, `/cli/auth` approval page, `/v1/cli/auth/poll`, `/v1/cli/auth/refresh`, `/v1/cli/auth/revoke`.

## Website copy hooks
- “Ship IoT logic at the edge with Cloudflare-grade scale.”
- “Per-device scripts, instant rollouts, and safe firmware delivery.”
- “Developer-first DX: TypeScript, OpenAPI, CLI, and built-in validation.”
- “Secure by default: OAuth login, hashed tokens, device codes, and scoped credentials.”
