# @devicesdk/server

## 0.2.2

### Patch Changes

- 79dcc96: Update all GitHub repo and Docker image references from `device-sdk/devicesdk-monorepo` to `device-sdk/devicesdk` following the GitHub repository rename.
- Updated dependencies [79dcc96]
  - @devicesdk/core@1.4.5

## 0.2.1

### Patch Changes

- e299282: Baseline community, security, and licensing cleanup:
  - Added `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md`.
  - Fixed root `README.md` tech-stack copy (website is Vue 3 + Vite SSG, not Hugo).
  - Replaced remaining `CLAUDE.md` references with `AGENTS.md` across docs and firmware readmes.
  - Updated `firmware/pico/IMPLEMENTATIONS.md` and `src/ca_cert.h` comments for the self-hosted era.
  - Added the AGPL-3.0-only license to every workspace `package.json` and copied `LICENSE` into `packages/core`, `packages/cli`, `packages/mcp`, and `packages/typescript-config`.
  - Excluded `examples/*` from the root `pnpm build` to avoid CLI-dependent example builds in the default task.
  - Removed `apps/server/openapi.json` from git, gitignored the generated file, and updated website-deploy triggers to rebuild it from server sources.
  - Hardened Docker defaults: `ALLOW_REGISTRATION=false`, `SECURE_COOKIES=true`, non-root runtime user, and a `/health` `HEALTHCHECK`.
  - Added GitHub issue/PR templates and `CODEOWNERS`.
  - Scoped Device WebSocket `versionId` lookup to the device (`device_id` filter).
  - Scoped CLI token revocation to the authenticated user (`user_id` filter).

- 6f5a3e9: Create `CLAUDE.md` as a symlink to `AGENTS.md` so Claude Code automatically loads the project guidance, and update the Agent Configuration section to document the link.
- Updated dependencies [e299282]
  - @devicesdk/core@1.4.4

## 0.2.0

### Minor Changes

- 7cffbef: Audit Batch 02 - Auth & Token Hardening
  - Drops the legacy plaintext `tokens.token` column after clearing any residual values.
  - Replaces unsalted SHA-256 token storage with HMAC-SHA-256 using a server-side secret (`API_TOKEN_SECRET`); legacy SHA-256 hashes remain verifiable during the transition.
  - Persists an auto-generated API token secret under `DATA_DIR` when `API_TOKEN_SECRET` is not provided.
  - Increases CLI access/refresh token entropy from 16 bytes (128 bits) to 32 bytes (256 bits).
  - Purges expired `cli_tokens` rows in the janitor.
  - Updates dashboard E2E seed fixtures to use `token_hash`/`last_four` now that `tokens.token` is removed.

- 60a9f49: Add mDNS service discovery so devices connect to the server without a static IP.
  - **Server**: a zero-dependency multicast-DNS responder (`apps/server/src/foundation/mdns/`,
    over `node:dgram`) advertises the server as `<MDNS_HOSTNAME>.local` (default
    `devicesdk.local`). Two new env vars: `MDNS_HOSTNAME` (rename to run several DeviceSDK
    servers on one LAN) and `MDNS_ENABLED` (default `true`). Started after the janitor and
    stopped on SIGINT/SIGTERM with a TTL-0 goodbye. Covered by the server's first `bun test`
    suite (packet codec + responder).
  - **Firmware**: ESP32 (`CONFIG_LWIP_DNS_SUPPORT_MDNS_QUERIES`) and Pico W (`LWIP_IGMP` +
    `LWIP_DNS_SUPPORT_MDNS_QUERIES`) now resolve `.local` hostnames over mDNS, so a device
    flashed with `--host http://devicesdk.local:8080` keeps reaching the server across DHCP
    lease changes. No connection-logic changes - the existing explicit-port heuristic already
    selects plain `ws://` for LAN hosts.
  - **Docs**: README, quickstart, and the `flash` CLI reference document flashing against the
    mDNS name; the roadmap marks server-side mDNS advertisement as shipped.

- 6d0a71b: DeviceSDK is now a self-hosted, open-source platform. The Cloudflare-hosted
  backend (`apps/api`) is replaced by `@devicesdk/server`, a single Bun process
  (Hono + bun:sqlite + filesystem storage) that serves the REST API, device and
  watcher WebSockets, and the dashboard UI on one port, distributed as a Docker
  image (amd64 + arm64).
  - Server: in-process device runtime replaces Durable Objects (same watch
    protocol, command acks, connection-gated crons, per-device KV, inter-device
    RPC); local email/password accounts replace Google OAuth; usage metrics in
    SQLite replace Analytics Engine; plans/tiers/daily message limits removed.
  - Dashboard: local login/registration with first-run setup; served
    same-origin by the server; cost/billing UI removed.
  - CLI: no default cloud endpoint - connect with `devicesdk login --host
http://<server>:8080` (stored in credentials) or `DEVICESDK_API_URL`.
  - Firmware: Pico gains plain `ws://` support when the host has an explicit
    port (ESP32 already had it); binaries now publish to rolling GitHub
    Releases instead of R2.
  - License: AGPL-3.0-only.

### Patch Changes

- f052fed: Add audit findings as addressable batches, plus `/pull` and `/feature` OpenCode commands
  - Added `audit/batch-*.md` files grouping security, code-quality, dependency,
    architecture, and documentation findings from the project-wide audit into
    small batches of 3–4 tasks each.
  - Added `.opencode/commands/pull.md` so `/pull` checks out `main` and pulls the
    latest changes.
  - Added `.opencode/commands/feature.md` and `.opencode/skills/feature/SKILL.md`
    so `/feature <path-or-instruction>` delegates implementation to a subagent,
    auto-reviews and fixes BLOCKER/IMPORTANT findings in a loop, and opens a PR.
  - Updated `AGENTS.md` to list the new `/pull` and `/feature` commands alongside
    the other OpenCode slash commands.

- ab7ea11: Critical safety and correctness fixes (Audit Batch 01).
  - **Database atomicity**: `D1CompatDatabase.batch()` now executes statements inside a synchronous `db.transaction(...)` callback, restoring atomicity for callers that rely on `c.env.DB.batch()` (entity upserts, env-var sets, CLI token refresh).
  - **Health probes**: added unauthenticated `GET /health` and `GET /ready` endpoints. `/health` returns a lightweight `{success:true,result:{status:"ok"}}`; `/ready` verifies SQLite is writable and returns 503 if not. The troubleshooting docs now reference both endpoints.
  - **Device socket replacement**: when a new connection replaces a stale one, the outgoing socket's pending commands are rejected immediately and its `connectedSeconds` usage is recorded before the replacement takes over.
  - **Process crash protection**: `server.ts` now registers `unhandledRejection` (log) and `uncaughtException` (log + `process.exit(1)`) handlers in addition to the existing `SIGTERM`/`SIGINT` shutdown logic.

- 3a72934: Self-host release readiness pass
  - Added `KNOWN_NOT_ISSUES.md` documenting the npm Trusted Publishers release setup.
  - Fixed dashboard token snippet and redirect allow-list for custom self-hosted origins.
  - Added `apps/server/.env.example` and a `TRUST_PROXY` setting so rate limiting safely handles reverse proxies.
  - Removed stale cloud-era wording from `@devicesdk/core`, the CLI `init` template, and `examples/AGENTS.md`.
  - Corrected OTA firmware claims in docs until the feature ships.
  - Updated `TROUBLESHOOT.md` to reference self-hosted dashboard URLs and generic proxy/CDN guidance.
  - Added `data/` directories to `.gitignore`, pinned the Bun version in `Dockerfile` to `1.3.14`, and renamed `durableObjectStub.ts` to `deviceHandle.ts`.
  - Documented the intentionally skipped migration `0003` in `apps/server/migrations/README.md`.

- 1d977f9: Add an end-to-end test suite for the server, taking line coverage to ~96% (and
  function coverage ~89%), well past the 85% bar. A new in-process harness
  (`apps/server/tests/harness.ts`) boots the real Bun server on an ephemeral port
  and drives it over HTTP plus device/watcher WebSockets, with a device simulator
  that speaks the firmware protocol. The suite covers auth + CLI device-code flow,
  projects, devices, entities, scripts (upload/deploy/batch/pruning), tokens,
  env-vars, firmware download + checksum patching, metrics, logs, the db layer,
  cron parsing, and the device runtime (sessions, sender surface, KV, inter-device
  RPC, log/state broadcasts, backfill). CI gains a `Server E2E Tests` job that runs
  the suite with a project-wide ≥85% coverage gate (`scripts/coverage-gate.ts`).
- 4ab9f27: Add a Bun FileSink-backed server logger with size-based rotation and inject it into runtime classes.
  - `ServerLogger` is a global singleton that writes JSON log lines to `DATA_DIR/server.log` (override via `LOG_FILE`).
  - Logs are flushed after each write and rotated when the file exceeds 10 MiB (configurable via constructor options; kept up to 5 backups).
  - `DeviceHub` and `DeviceSession` now receive the logger through constructor injection.
  - Replaced the stray `console.debug` in `getDeviceConnectionStatus` with the new logger.

- Updated dependencies [874cd73]
- Updated dependencies [3a72934]
- Updated dependencies [6d0a71b]
  - @devicesdk/core@1.4.3
