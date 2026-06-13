# DeviceSDK — Agent Guide

This file provides guidance to AI coding agents (OpenCode, Claude Code, Cursor,
etc.) when working with code in this repository.

## What this is

DeviceSDK is a **self-hosted, open-source (AGPL-3.0)** IoT platform: users write
TypeScript device scripts, deploy them via CLI to a server they run themselves
(Raspberry Pi, NUC, Docker), and microcontrollers (ESP32/Pico) connect to that
server over WebSocket. Distributed as a Docker image containing the Bun server +
dashboard UI. There is no cloud/SaaS component — the Cloudflare-hosted era ended
with the self-host refactor (see ROADMAP.md for direction; the old Workers
implementation is preserved in pre-refactor git history).

## Build & Development Commands

```bash
# Build everything (Turbo handles dependency order: core → cli/server/simulation → dashboard/website)
pnpm build

# Dev servers
pnpm dev --filter @devicesdk/server      # Bun server on port 8080 (bun run --watch)
pnpm dev --filter @devicesdk/dashboard   # Quasar dev server on port 9000
pnpm dev --filter @devicesdk/simulation  # Vite dev on port 9002
pnpm local                               # server + dashboard concurrently

# Server checks
pnpm check-types --filter @devicesdk/server   # tsc
pnpm lint --filter @devicesdk/server          # Biome
cd apps/server && bun run scripts/generate-openapi.ts   # regen openapi.json

# Tests
pnpm test --filter @devicesdk/server          # server unit tests (bun test)
pnpm test --filter @devicesdk/cli             # CLI unit tests (vitest)
pnpm test:unit --filter @devicesdk/dashboard  # Vitest component tests
pnpm test:e2e --filter @devicesdk/dashboard   # Playwright E2E

# Docker
docker build -t devicesdk .
docker compose up -d                          # serves everything on :8080
```

The server stores ALL state under `DATA_DIR` (default `./data`, `/data` in
Docker): `devicesdk.sqlite` (WAL),
`scripts/{userId}/{projectSlug}/{deviceSlug}/{versionId}.js`, `firmwares/`.

## Monorepo Architecture

pnpm + Turborepo. Bun is the **server runtime only** — the CLI/MCP run on plain
Node for npm users.

**`apps/server`** (`@devicesdk/server`) — THE backend. Bun + Hono + Chanfana
(OpenAPI) + Zod + bun:sqlite. One process, one port (8080): REST API under
`/v1/*`, device + watcher WebSockets, dashboard SPA static serving, OpenAPI docs
at `/api-docs`.

**`apps/dashboard`** — Vue 3 + Quasar SPA. Local email/password auth
(register/login). Built `dist/spa` is served same-origin by the server;
`VITE_API_HOST` only matters for `quasar dev`.

**`packages/core`** — published types + `DeviceEntrypoint` base class (user
script surface). No runtime deps.

**`packages/cli`** — `devicesdk` binary: login/build/deploy/flash/logs/status/dev.
No default API URL: precedence is `DEVICESDK_API_URL` env → `--host` flag → host
stored in `~/.devicesdk/credentials.json` by `devicesdk login --host <url>`.
`devicesdk dev` still uses the workerd simulator (convergence on the server
runtime is a roadmap item).

**`packages/mcp`** — MCP server wrapping the CLI for AI agents.

**`apps/simulation`** — Vue UI for the CLI dev simulator (built dist embedded in
CLI).

**`apps/website`** + **`docs/public`** — Hugo site. Website build consumes
`apps/server/openapi.json`.

**`firmware/esp32`, `firmware/pico`** — C/C++ WS clients. Both select **plain
`ws://` when the configured host contains an explicit port** (self-hosted LAN)
and TLS-on-443 for bare hostnames. Binaries are published to rolling GitHub
Releases (`firmware-esp32`, `firmware-pico` tags) and bundled into the Docker
image.

### Server architecture (apps/server)

- **Boot**: `src/server.ts` — loadConfig → open SQLite (WAL) → `applyMigrations`
  → construct services → `Bun.serve` → janitor interval. Services object is
  passed as `c.env` to Hono and **keeps the old Cloudflare binding names**
  (`SCRIPTS`, `FIRMWARES`, `DEVICE`, `DB`) so ported endpoint code reads
  naturally.
- **DB layer**: `src/db/bunSqliteQB.ts` (workers-qb QueryBuilder over
  bun:sqlite, D1-shaped results) for `c.get("qb")`; `src/db/d1Compat.ts`
  (prepare/bind/first/all/run/batch facade) for `c.env.DB` call sites;
  `src/db/migrate.ts` runs `migrations/*.sql` sequentially. **Never run
  migration SQL through workers-qb Query objects** — `trimQuery()` collapses
  newlines so `--` comments swallow SQL (see TROUBLESHOOT.md).
- **Auth**: `src/foundation/auth.ts` — Bearer token → session cookie → `dsdk_`
  CLI token → API token hash. Local accounts via `Bun.password` (argon2id) in
  `src/endpoints/auth/localAuth.ts`; CLI device-code flow in
  `src/endpoints/cli-auth/`. First registered user is always allowed;
  `ALLOW_REGISTRATION=false` closes signups after that.
- **Device runtime**: `src/runtime/` — replaces the old per-device Durable
  Object:
  - `deviceHub.ts` — session registry keyed `${projectId}:${deviceId}` (UUIDs);
    sessions live for the process lifetime and serve watchers/RPC even while the
    device is offline.
  - `deviceSession.ts` — WS lifecycle, `pendingCommands` ack map (5s timeout),
    **per-session FIFO promise chain** serializing user-handler dispatch,
    connection-gated crons (missed slots are skipped, never caught up —
    documented contract), `device_kv` storage with the `__internal:` prefix
    reserved, usage recording.
  - `scriptHost.ts` — dynamic `import()` of version-keyed bundle files + direct
    class instantiation; replicates the old classProxy contract (DEVICES bridge
    with call-depth threading, VARS, BLOCKED_METHODS + own-prototype check for
    RPC).
  - `consoleCapture.ts` — AsyncLocalStorage-scoped console patch: user
    `console.*` lands in device logs + watcher stream. `logger.ts` binds the raw
    console at module load so server logs are never captured.
  - `devicesBridge.ts` — inter-device RPC (same-project trust model,
    `MAX_CALL_DEPTH` 3).
  - WS routes: `src/endpoints/devices/wsRoutes.ts` via the shared `src/ws.ts`
    `createBunWebSocket` singleton — the same instance must feed both route
    handlers and `Bun.serve({ websocket })`, and the services object must carry
    the Bun `server` handle for upgrades.
- **Watch protocol** (unchanged from the cloud era, dashboard + CLI depend on
  it): frames `{event: "log"|"status"|"state"|"history_complete", data,
  replay?}`; `?backfillLimit=N&backfillLevel=warn` replays history oldest-first
  then `history_complete`.
- **Metrics**: `src/foundation/usageMetrics.ts` — 5-minute SQLite buckets in
  `device_usage`; windows 1h/12h/7d. No cost estimation (that was a
  cloud-billing concept).
- **Janitor**: `src/janitor.ts` hourly — expired sessions/CLI codes, old
  logs/usage.
- **mDNS**: `src/foundation/mdns/` — a zero-dependency multicast-DNS responder
  (`node:dgram`) advertising the server as `<MDNS_HOSTNAME>.local` (default
  `devicesdk`) so LAN devices resolve it without a static IP. `dnsPacket.ts` is
  the pure wire codec; `responder.ts` wraps it in a socket. Started in
  `server.ts` after the janitor (toggle `MDNS_ENABLED`), stopped on
  SIGINT/SIGTERM with a TTL-0 goodbye.
- **Response format**: `{ "success": true, "result": ... }` or
  `{ "success": false, "error": "..." }`.

### Device script contract (user-facing, do not break)

A script is a class with optional
`onDeviceConnect/onDeviceDisconnect/onMessage/onCron` and a `crons` map; env
exposes `DEVICE` (command sender + `kv`), `DEVICES` (same-project RPC), `VARS`
(env vars). Public methods on the class are callable cross-device; lifecycle
methods are blocked from RPC. User scripts run **in-process** (user-owned code
on the user's own server — that's the trust model).

## Source-of-Truth Locations

| Concern | Canonical Location |
|---------|-------------------|
| Shared types and device abstractions | `packages/core` |
| Auth middleware + sessions | `apps/server/src/foundation/auth.ts` |
| Local account endpoints | `apps/server/src/endpoints/auth/localAuth.ts` |
| Server config/env vars | `apps/server/src/config.ts` |
| DB adapters + migration runner | `apps/server/src/db/` |
| Database schema | `apps/server/migrations/` (sequential SQL files) |
| Table type definitions | `apps/server/src/types.d.ts` |
| Device runtime (sessions/crons/RPC/logs) | `apps/server/src/runtime/` |
| Script validation (static, Bun.Transpiler) | `apps/server/src/foundation/scriptValidator.ts` |
| Blob storage (scripts/firmwares) | `apps/server/src/storage/fsBlobStore.ts` |
| mDNS responder (`<name>.local`) | `apps/server/src/foundation/mdns/` |
| Usage metrics | `apps/server/src/foundation/usageMetrics.ts` |
| Watch WebSocket routes | `apps/server/src/endpoints/devices/wsRoutes.ts` |
| Dashboard watch composable | `apps/dashboard/src/composables/useDeviceStream.ts` |
| HA entity types/persistence | `packages/core` + `apps/server/src/endpoints/devices/{get,upsert}DeviceEntities.ts` |
| ESP32/Pico image checksum patching | `apps/server/src/foundation/{esp32ImageChecksum,picoUf2Checksum}.ts` |
| Endpoint patterns | `apps/server/src/endpoints/` (Hono + Chanfana + Zod) |
| License | `LICENSE` (AGPL-3.0-only) |

## Open-source discipline

- The repo is public and **tests are open-source** — add tests alongside the
  code they cover. Server tests run via `bun test`
  (`pnpm test --filter @devicesdk/server`), the CLI via vitest, the dashboard
  via vitest/Playwright.
- No telemetry/phone-home in the server. Optional integrations must be opt-in
  env config.
- Never commit secrets; `client_secret*.json` and `.dev.vars` are gitignored.

## Anti-Redundancy Rules

- **Search before creating**: check `packages/core`,
  `apps/server/src/foundation/`, and existing endpoint patterns before writing
  new helpers.
- **Import from canonical sources**: types from `@devicesdk/core`, auth from
  `foundation/auth.ts`, queries via `c.get("qb")` / `c.env.DB`.
- **One source of truth**: no "V2" copies.

## Multi-Agent Safety

- Do **not** create/apply/drop `git stash` entries unless explicitly requested.
  Assume other agents may be working; keep unrelated WIP untouched.
- When the user says "push", you may `git pull --rebase` to integrate latest
  changes (never discard other agents' work). When the user says "commit", scope
  to your changes only.
- Create your **own** worktree per change (named after the change — see Git
  Workflow). Never create, remove, or modify a worktree or branch you didn't
  create.
- Do **not** switch branches unless explicitly requested.
- When you see unrecognized files, keep going; focus on your changes and commit
  only those.

## Git Workflow

- **Never commit directly to `main`, and never work in the main checkout.** Start
  every task by creating a dedicated worktree and branch named after the feature
  or change you are asked to do:

  ```bash
  git worktree add .worktrees/<feature-name> -b <feature-name>
  ```

  Work only inside that worktree. Do not create, remove, or modify worktrees or
  branches you did not create.

- **Before every commit**, run `pnpm lint`. Do not commit if linting fails.
- **Every PR must include a changeset** referencing every workspace package
  touched (npm-published: `@devicesdk/core`, `@devicesdk/cli`, `@devicesdk/mcp`;
  private-with-changelog: `@devicesdk/server`, `@devicesdk/dashboard`,
  `@devicesdk/simulation`, `@devicesdk/website`). Create it early in the branch
  with `pnpm changeset` so CI can validate it.
- **Firmware changes MUST include a changeset**
  (`@devicesdk/firmware-esp32` / `@devicesdk/firmware-pico`) — the version bump
  triggers the firmware build + rolling-release publish (`firmware-*.yml`). No
  changeset = won't ship.
- **Never set a `major` bump without explicit user consent.**
- **Finish the change by opening a PR into `main`** (`gh pr create --base main`)
  when the `origin` remote points to `github.com/device-sdk/devicesdk-monorepo`.
  If the remote URL is a fork or any other repository, do not open a PR
  automatically. Instead, tell the user the task is finished and ask how they
  would like to proceed (e.g. push to their fork, open a PR against upstream, or
  stop here).

## CI Runner Image

CI jobs labelled `[self-hosted, linux, proxmox-ephemeral]` run on a Proxmox VM
image the user maintains out-of-band. If a workflow needs a missing system
package, **ask the user to add it to the base image** — no passwordless sudo, no
userspace workarounds unless explicitly chosen. `firmware-esp32.yml` keeps a
comment near `runs-on:` listing required libs.

## Coding Standards

- **Strict types**: no `any` in implementation code; use `unknown` + narrowing.
- **Validate at boundaries**: all external input (request bodies, CLI args, env
  vars, WebSocket messages) via Zod or explicit checks.
- **File size**: keep files under ~700 LOC.
- **IDs**: `crypto.randomUUID()`; timestamps `Date.now()` (epoch ms).
- Bun-specific APIs (`bun:sqlite`, `Bun.password`, `Bun.serve`,
  `Bun.Transpiler`) belong in `apps/server` only — never in `packages/*` (those
  run on Node).

## Agent Configuration

This repository is configured for OpenCode:

- `opencode.json` — project configuration (loaded into every session).
- `.opencode/skills/` — reusable skill prompts for common tasks (PR workflow,
  API endpoints, firmware, Vue components, SQL queries, local E2E, website URL
  changes).
- `.opencode/commands/` — slash commands (`/review-pr`, `/prepare-pr`,
  `/merge-pr`, `/run-local-e2e`, `/pull`) that trigger the corresponding skills.

When working on the project, make sure these files are up to date and reference
`AGENTS.md` rather than any legacy `CLAUDE.md` paths.

## Troubleshooting Log

Maintain `TROUBLESHOOT.md` at the repo root. **Consult it first** when stuck;
record mistakes, non-obvious solutions, and Q&A using the established entry
format. Don't duplicate entries.

## Knowledge Capture

After completing any significant task, evaluate whether the work produced
knowledge worth persisting (AGENTS.md, TROUBLESHOOT.md, `.opencode/skills/`,
auto-memory). Treat it as the final step before reporting completion.
