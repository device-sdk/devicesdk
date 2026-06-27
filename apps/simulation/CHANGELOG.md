# @devicesdk/simulation

## 0.1.13

### Patch Changes

- Updated dependencies [79dcc96]
  - @devicesdk/core@1.4.5

## 0.1.12

### Patch Changes

- Updated dependencies [e299282]
  - @devicesdk/core@1.4.4

## 0.1.11

### Patch Changes

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

- Updated dependencies [874cd73]
- Updated dependencies [3a72934]
- Updated dependencies [6d0a71b]
  - @devicesdk/core@1.4.3

## 0.1.10

### Patch Changes

- Updated dependencies [0334095]
  - @devicesdk/core@1.4.2

## 0.1.9

### Patch Changes

- 660920d: May 2026 audit follow-up - security, observability, and tech-debt cleanup.

  **`@devicesdk/api`**
  - Fix: dropped user-worker events (transient retries past `MAX_USER_EVENT_ATTEMPTS`, persistent SyntaxError / missing-script failures) now report to Sentry with `userId` / `projectId` / `deviceId` / `versionId` context. Previously they hit `console.error` only and operators had no signal that a user's device had stopped processing events.
  - Internal: new `foundation/logger.ts` wraps `@sentry/cloudflare` so errors auto-capture and info/warn add breadcrumbs. ~30 ad-hoc `console.*` sites in API code now route through it.
  - Internal: removed the deprecated `GET /v1/projects/:projectId/devices/:deviceId/logs/stream` SSE endpoint (deprecated May 2026). Verified no remaining consumers - both the CLI and dashboard moved to the watcher WebSocket. The `streamLogs()` method and in-memory `logWatchers` Map were dropped from the Device DO.
  - Internal: extracted `enqueueUserWorkerEvent` / `drainPendingUserWorkerEvents` from `device.ts` into a new `userEventQueue.ts` module so the queue logic is testable without spinning up the full Durable Object.
  - Internal: extracted `persistAndBroadcastLog` / `fetchRecentLogs` / `emitStatusEvent` / `broadcastToWatchers` / `broadcastStateFromMessage` from `device.ts` into a new `logStreaming.ts` module. `device.ts` is down from 1633 → 1316 LOC (still over the 700 LOC bar; further slimming is roadmapped).
  - Test infra: vitest coverage thresholds set to lines 70 / statements 70 / functions 75 / branches 55, derived from the 2026-05-10 baseline. Added a node-environment `tests/vitest.unit.config.mts` with the first unit test (`tests/unit/userEventQueue.test.ts`) that mocks `foundation/logger` to assert the dropped-events Sentry contract on both drain failure branches.

  **`@devicesdk/core`**
  - Internal: split the 985-LOC `src/index.ts` into focused modules (`commands.ts`, `responses.ts`, `runtime.ts`, `identity.ts`, `ha.ts`, `entrypoint.ts`); `index.ts` is now a barrel that re-exports everything. The package's `exports` map is unchanged, so consumers see identical types.

  **`@devicesdk/cli`**
  - Internal: split the 850-LOC `src/api.ts` into per-resource modules under `src/api/` (auth, projects, devices, scripts, tokens, commands, envVars, entities, logs, plus a shared helpers module). `src/api.ts` is now a one-line re-export shim, so existing `from "../api.js"` imports keep working unchanged.
  - Test infra: new `tests/` folder with vitest scaffolding plus first opinionated tests for `whoami` and `logout` (existing co-located `src/*.test.ts` tests still run alongside).
  - Internal: narrowed several `any` casts (request response parsing, login error narrowing).

  **`@devicesdk/dashboard`**
  - Add: global Vue error + warning handlers wired through a new `boot/error-handler.ts`. Without this, an exception in a component render or watcher silently kills the UI subtree and the user sees a blank page; now uncaught errors surface as a Quasar Notify toast.
  - Internal: extracted the inline `scriptTemplates` list and ~300-LOC `templateCode` map out of `DeviceDetailsPage.vue` into `src/lib/scriptTemplates.ts`, getting the page from 943 → 629 LOC (back below the 700-LOC ceiling).
  - Internal: replaced `: any` boot-file params with `{ app: App }` shapes; the `useAuth` boot file's `app.$pinia` access uses a narrow cast instead of `any`.
  - Test infra: vitest coverage configured (measurement only, no thresholds yet). New `tests/unit/errorHandler.spec.ts` covers the error-handler boot file (Error → Notify toast, non-Error fallback, warnHandler is console-only).

  **`@devicesdk/simulation`**
  - Test infra: vitest coverage configured (measurement only, no thresholds yet).

  **Repo-wide**
  - New: husky + lint-staged pre-commit hook automates the `pnpm lint` step from CLAUDE.md so it can no longer be bypassed.
  - CI: Playwright browsers cached in the dashboard E2E job in `ci.yml` (saves ~30s per E2E run when warm).
  - New: `roadmap.md` at the repo root tracks the audit's bigger-investment items + the per-tab component split that was deferred from the DeviceDetailsPage refactor.

- Updated dependencies [660920d]
- Updated dependencies [7e66d0f]
  - @devicesdk/core@1.4.1

## 0.1.8

### Patch Changes

- Updated dependencies [d03b5ae]
  - @devicesdk/core@1.4.0

## 0.1.7

### Patch Changes

- 394d469: UX fixes batched from a new-user trial - eight small papercuts, one PR:
  - **@devicesdk/cli**: `loadConfig` / `getConfigDir` now walk up parent directories to find `devicesdk.ts`, so `deploy`, `dev`, `flash`, `logs`, `status`, `inspect`, and `env` work from any subdirectory of a project. `--config` and `DEVICESDK_CONFIG` still short-circuit the walk.
  - **@devicesdk/cli**: `devicesdk logs` accepts optional positionals - both default from `devicesdk.ts`. With one positional it's treated as the device slug (project comes from config); with two, it's `[project] [device]` as before. Multi-device projects without a positional get a friendly "pass one as positional" error listing the available device slugs.
  - **@devicesdk/cli**: 4xx response bodies are no longer dumped to stderr on every API error. Auth-revoked sessions now print one line - `Session expired - run \`devicesdk login\`.`- instead of`Response body (401): { ... }`followed by paragraph-long advice. Run with`--verbose`to keep the raw dump for debugging. The`downloadDeviceFirmware`path picks up the same treatment, so`flash` is quieter on auth/server errors.
  - **@devicesdk/cli**: `flash` permission-denied error mentions the Arch Linux `uucp` group (not just Debian's `dialout`) and links to the docs page that ships a persistent `99-devicesdk-serial.rules` snippet.
  - **@devicesdk/api**: the device runtime no longer prepends `[<projectId>:<deviceId>]` to every `console.log/info/warn/error/debug` call. Persisted log entries were already prefix-free; this drops the redundant tag from Wrangler tail / runtime stdout. Devices already carry their identity via the watcher URL.
  - **@devicesdk/simulation**: when the local dev server restarts after a file edit, the simulator UI now auto-reconnects with exponential backoff (1 s → 30 s) and shows a "Local server restarted - reconnecting…" banner instead of silently going dead until the user refreshes the browser.
  - **@devicesdk/website**: new `concepts/identifiers` page explains project slug vs device slug vs the underlying UUIDs in one place. The CLI reference index now points at it. The `flash` page documents serial-port permissions for both Debian-style (`dialout`) and Arch (`uucp`) systems, ships a copy-pasteable `99-devicesdk-serial.rules` udev snippet for CP210x / CH340 / FTDI bridges, and adds a "Verify connectivity" subsection pointing at `devicesdk status` after the LED sequence. The pin-read example on the first-device page is now a complete copy-pasteable snippet showing how to discriminate digital vs analog reads.

- Updated dependencies [71aedb1]
  - @devicesdk/core@1.3.0

## 0.1.6

### Patch Changes

- Updated dependencies [fd6e829]
  - @devicesdk/core@1.2.1

## 0.1.5

### Patch Changes

- Updated dependencies [e53d79f]
  - @devicesdk/core@1.2.0

## 0.1.4

### Patch Changes

- Updated dependencies [23b8924]
  - @devicesdk/core@1.1.2

## 0.1.3

### Patch Changes

- Updated dependencies [618636f]
- Updated dependencies [6ba99ed]
  - @devicesdk/core@1.1.1

## 0.1.2

### Patch Changes

- Updated dependencies [c9a38e3]
- Updated dependencies [9ab6698]
- Updated dependencies [00991a8]
- Updated dependencies [1c28cba]
  - @devicesdk/core@1.1.0

## 0.1.1

### Patch Changes

- Updated dependencies [bc3493a]
- Updated dependencies [bdd52f7]
  - @devicesdk/core@1.0.0
