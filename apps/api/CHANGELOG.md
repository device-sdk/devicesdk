# @devicesdk/api

## 0.3.0

### Minor Changes

- 25a68b4: Add read endpoints for per-device and per-project usage metrics, backed by the `devicesdk_usage` Analytics Engine dataset via Cloudflare's Analytics Engine SQL API:
  - `GET /v1/projects/:projectId/devices/:deviceId/metrics?window=1h|12h|7d` — time-bucketed messages in/out, bytes, cron fires, connection seconds, and estimated cost for one device.
  - `GET /v1/projects/:projectId/metrics?window=1h|12h|7d` — one usage series per device, project-wide totals, and a 30-day daily _estimated_ spend chart.

  Adds a `pricing.ts` source of truth for cost estimation and a `metricsClient.ts` that builds the AE SQL queries (sampling-aware via `_sample_interval`), guards interpolated identifiers, and degrades gracefully to empty result sets when the `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` credentials are absent (reusing the existing deploy token; needs Account Analytics: Read).

  Pricing follows the platform model documented in the new root `pricing.md`: **only WebSocket messages (in + out) are metered** — connections, uptime, cron invocations, transfer bytes, storage, logs, and metrics are free, so only the message rate is non-zero. The per-message rate is a placeholder until public Pro pricing is set. All numbers are sampled estimates, not exact billing.

- 91e6c8b: Record per-device usage metrics to a new `devicesdk_usage` Analytics Engine dataset (indexed by deviceId). The device Durable Object now emits inbound message, outbound command, cron-fire, and connection-duration data points (with byte counts) on the hot path via a new `recordDeviceUsage` helper. Writes are no-ops when the `USAGE` binding is absent and never throw into a request. This is the data-collection foundation for upcoming per-device / per-project dashboard metrics and estimated billing.

### Patch Changes

- 8e0cdc9: fix(api): defer device `onDeviceDisconnect` to the alarm queue so a reconnect after a disconnect is never wedged

  `handleConnectionLost` (called from the Hibernation-API `webSocketClose` / `webSocketError` handlers) invoked the Worker Loader inline — `getOrCreateUserWorker()` plus `onDeviceDisconnect()`. Invoking the Worker Loader from a Hibernation-API handler hangs in production and wedged the device's dynamic-worker slot, so after a device disconnected and reconnected it completed the WebSocket handshake but never received another command (ESP32 stuck on the "Server" screen after a disconnect/reconnect cycle). The disconnect lifecycle hook is now dispatched through the same alarm-drained user-event queue as `onDeviceConnect` / `onMessage`, so the close handler only does cheap storage work and the next connect is always served.

## 0.2.13

### Patch Changes

- dab8cfa: Bound the per-device deferred-event drain so a large backlog can no longer wedge a device. `drainPendingUserWorkerEvents` previously flushed the entire `PENDING_USER_EVENTS_KEY` queue in a single Durable Object alarm invocation. A device that built up a big backlog (e.g. connection churn or unsolicited messages while its cron alarm was paused) would, once the alarm resumed, exceed the runtime's per-invocation subrequest limit on every tick — aborting the invocation before it could dispatch `onCron` or even trim the queue, so the backlog never shrank and the device stopped updating (observed as a per-minute alarm stuck on "Too many subrequests by single Worker invocation"). The drain now processes at most `MAX_DRAIN_BATCH` (50) events per invocation, persists the remainder, and arms a follow-up alarm to continue. `enqueueUserWorkerEvent` also coalesces redundant `connect` events (onDeviceConnect is idempotent) and hard-caps the queue at `MAX_PENDING_EVENTS` (500) so a churning device can never grow it without bound.

## 0.2.12

### Patch Changes

- 0334095: Audit cleanup (correctness, tech-debt, deps, CI):
  - **dashboard:** fix a watcher-WebSocket reconnect storm in `useDeviceStream` — `onerror`+`onclose` both fired the reconnect handler, scheduling duplicate reconnects and leaking the first timer (which `disconnect()` could then no longer cancel). Each socket now reconnects at most once per drop.
  - **api:** script-validation `400`s now include the canonical `error` string (alongside the structured `errors`), so `devicesdk deploy` surfaces the real validation messages instead of a generic "Request failed with status 400".
  - **cli:** `dev` now scans for a genuinely-free fallback port instead of picking one random port that could itself be in use; the Linux `lsblk` volume parser no longer truncates labels/mountpoints containing `=`; `logs --tail` bounds its `seenIds` dedup set in long-running sessions.
  - **core/api/cli:** centralized the script-size limit as `MAX_SCRIPT_SIZE_BYTES` in `@devicesdk/core`, consumed by the API upload validation and the CLI pre-deploy check (one source of truth).
  - **firmware (esp32 + pico):** fix `i2c_write` on real hardware — the handlers required a base64 string, but the SDK sends (and `i2c_batch_write`/SPI accept) a hex-string array, so writes were silently dropped on a device. Both handlers now parse the hex-string array.
  - **dashboard:** removed unused Quasar scaffolding; de-duplicated the `normalizeTimestamp`/`formatDate` helpers into `lib/time.ts`.
  - **api (security):** bumped `hono` 4.10.7 → 4.12.23 (clears several advisories; the affected JWT middleware is unused) and pinned `chanfana` to exact `3.3.0` to match its patch target. Also bumped `@sentry/cloudflare` and (dashboard) `axios` to latest.
  - **repo/CI:** untracked the vendored ESP-IDF `managed_components/` (re-fetched at build time via `idf_component.yml`); added minimal `permissions: { contents: read }` to `ci.yml`/`deploy.yml`; SHA-pinned all third-party GitHub Actions; bumped `turbo`; reconciled the ESP-IDF version in docs to match CI (`v5.5.1`).

- 45da6df: Fix per-device cron schedules permanently stopping after a connection blip. The cost guard added in #111 cancels a device's Durable Object alarm whenever it fires with no device socket present, and the only path that re-armed it was `initializeCrons()` — which runs only after a fresh `device_connected` handshake is drained. A device whose WebSocket was re-established at the transport level without re-sending that handshake (or a half-open connection the runtime later replaces) was left with its cron dead forever, even while the device still reported as connected. The device connect handler now re-arms the cron alarm from the persisted schedule on every WebSocket accept (`rearmCronAlarmFromStorage()`), independent of the handshake, skipping any fire time that elapsed while offline.
- 17ae750: Stop firing device cron schedules while no device is connected. Previously, a script that declared a frequent cron (e.g. `*/1 * * * *`) kept waking its Durable Object — and re-invoking the user Worker — every minute forever after the device disconnected, billing for work that could never reach hardware. The alarm handler now cancels the alarm when no device WebSocket is present and leaves the schedule in storage; reconnecting re-arms it (preserving each cron's `nextFireAt`). Pending user-worker events queued for a transient retry are unaffected.
- Updated dependencies [0334095]
  - @devicesdk/core@1.4.2

## 0.2.11

### Patch Changes

- 660920d: May 2026 audit follow-up — security, observability, and tech-debt cleanup.

  **`@devicesdk/api`**
  - Fix: dropped user-worker events (transient retries past `MAX_USER_EVENT_ATTEMPTS`, persistent SyntaxError / missing-script failures) now report to Sentry with `userId` / `projectId` / `deviceId` / `versionId` context. Previously they hit `console.error` only and operators had no signal that a user's device had stopped processing events.
  - Internal: new `foundation/logger.ts` wraps `@sentry/cloudflare` so errors auto-capture and info/warn add breadcrumbs. ~30 ad-hoc `console.*` sites in API code now route through it.
  - Internal: removed the deprecated `GET /v1/projects/:projectId/devices/:deviceId/logs/stream` SSE endpoint (deprecated May 2026). Verified no remaining consumers — both the CLI and dashboard moved to the watcher WebSocket. The `streamLogs()` method and in-memory `logWatchers` Map were dropped from the Device DO.
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

- 7e66d0f: Infra and quality improvements (no user-visible changes):
  - **API metrics** — emit Analytics Engine data points for command RPC latency, user-script init time, and Worker Loader failures. New `ANALYTICS` binding declared in `apps/api/wrangler.jsonc` (top-level + `env.production`); thin wrapper at `apps/api/src/foundation/analytics.ts` with three event kinds (`command_rpc`, `script_init`, `loader_failure`) using `event_kind` as the index for cross-cutting queries. Safe with the binding undefined (local dev / tests no-op).
  - **`@devicesdk/core` unit tests** — add `vitest` to the package with runtime tests for `I2cDevice` and `SSD1306` (constructor defaults, the `esp32c3OledVariant` factory, pixel ops, drawing primitives, sparse encoding) and type-level guards for the `DeviceCommand` / `DeviceResponse` discriminated unions, including the `payload.mode`-discriminated `PinStateUpdate`. Wired into root `pnpm test` and `turbo run test`.
  - **Pico firmware host tests in CI** — the existing gtest suite under `firmware/pico/test/` (base64, i2c command handlers, display update, ws client) is now built and run in `.github/workflows/firmware-pico.yml`, mirroring the ESP32 pattern. The `build` job depends on `unit-tests` so a regression blocks the firmware build.
  - **Workflow consolidation** — `dashboard-tests.yml` is merged into `ci.yml` as `Component Tests` and `E2E Tests` jobs (gated on PR events, matching prior behavior). Old workflow file removed. Branch protection: required-status-check names change from `Dashboard Tests / *` to `CI / *` — update settings post-merge.
  - **PR preview deploys** — new `.github/workflows/preview-deploys.yml` publishes per-PR preview URLs for the dashboard and website using `wrangler versions upload --tag pr-N`, gated on changed paths. Each preview posts (and updates) a sticky PR comment with the URL. Website's `preview_urls` flag flipped to `true` to enable preview URL emission; production traffic still routes via the custom domain.

- Updated dependencies [660920d]
- Updated dependencies [7e66d0f]
  - @devicesdk/core@1.4.1

## 0.2.10

### Patch Changes

- d03b5ae: Major AI-agent-friendliness pass across the SDK so users' coding agents (Claude, Cursor, Copilot, Aider, etc.) can work in DeviceSDK projects with the right context on the first try.

  **`@devicesdk/core`** — additive only:
  - Ships `AGENTS.md` inside the npm tarball (`node_modules/@devicesdk/core/AGENTS.md`) — version-matched API guidance for agents.
  - Ships the full `docs/` folder (guides, examples) inside the tarball.
  - JSDoc with runnable `@example` blocks added to every method on `DeviceSenderInterface`. Lifecycle hooks on `DeviceEntrypoint` (`onDeviceConnect`, `onDeviceDisconnect`, `onMessage`, `onCron`) now carry block-comment JSDoc that survives into the `.d.ts`.
  - New: branded ID types (`ProjectId`, `DeviceId`, `ScriptId`, `TokenId`) plus boundary constructors (`asProjectId`, `asDeviceId`, …) for nominal-style ID safety.
  - New: `OnboardLED = 99` constant for portable LED code across Pico W, Pico 2 W, ESP32-C3, ESP32-C61.
  - New: literal pin unions in `@devicesdk/core/devices/pico` (`PicoGpioPin`, `PicoAdcPin`, `PicoPwmPin`) and a new subpath `@devicesdk/core/devices/esp32` (`Esp32GpioPin`, `Esp32C3GpioPin`, `Esp32C61GpioPin`, etc.).
  - Expanded npm `keywords` and pointed `homepage` at `/docs/`.
  - Fixed: README hello-world snippet referenced a nonexistent `this.ctx.device.log` API; now uses `console.log` and properly types `onMessage(message: DeviceResponse)`.

  **`@devicesdk/cli`** — additive only:
  - `devicesdk init` now scaffolds `AGENTS.md`, `CLAUDE.md` (one-line `@AGENTS.md`), `.cursor/rules/devicesdk.mdc`, `.mcp.json` (preconfigured for `@devicesdk/mcp`), and a project `README.md`.
  - `devicesdk init` no longer scaffolds `onMessage(message: any)` — templates use `onMessage(message: DeviceResponse)` and demonstrate inter-device RPC.
  - `devicesdk build` now emits `import type { UserWorkerEnv }` instead of the deprecated `GetEnv` alias in `devicesdk-env.d.ts`.
  - New `--json` flag on `whoami`, `status`, `logs`, `env list` (output `{success, result|error}`). `logs --tail --json` emits NDJSON. `DEVICESDK_OUTPUT=json` works as a global toggle.
  - `DeviceSDKApiError` now carries an optional `docs` URL alongside the existing `code`. `parseErrorBody` extracts both. Added `invalid_cli_token` and `missing_credentials` to the auth-expired set so the CLI surfaces the right "run `devicesdk login`" hint.
  - Help text gained "More: <docs-url>" footers.

  **`@devicesdk/mcp`** — new package:
  - `npx -y @devicesdk/mcp` runs an MCP stdio server exposing 7 tools to coding agents: `devicesdk_whoami`, `devicesdk_status`, `devicesdk_logs_tail`, `devicesdk_env_list`, `devicesdk_env_set`, `devicesdk_deploy`, `devicesdk_docs_search`.
  - Each tool wraps the equivalent `devicesdk <cmd> --json` invocation; auth is inherited from the CLI's `~/.devicesdk/auth.json`.

  **`@devicesdk/api`** — additive only:
  - `apps/api/src/foundation/auth.ts` now returns differentiated, machine-readable error codes (`missing_credentials`, `invalid_token`, `invalid_cli_token`, `account_suspended`, `account_deletion_pending`) and a `docs` URL pointing at the new `/docs/errors/<CODE>/` pages, in place of the previous catch-all `"Authentication error"` string.
  - `DeviceSender` (`apps/api/src/durableObjects/lib/deviceSender.ts`) now validates pin/range/I2C/SPI/UART/WS2812 arguments synchronously before round-tripping to firmware. Bad calls (`setGpioState(999, "high")`, `setPwmState(0, 0, 5.0)`, malformed I2C addresses, `pioWs2812Update([[256, 0, 0]])`, etc.) now throw a typed error with `code: "invalid_argument"` and a `docs` URL instead of silently returning a `command_error` event.

  **Behaviour change to note**: scripts that previously relied on `setGpioState(badPin, …)` round-tripping and surfacing as a `command_error` event in `onMessage` will now throw synchronously from the `await` site. Catch the error or fix the argument — the `docs` field on the thrown Error points at the right reference page.

  **`@devicesdk/website`** — content + agent affordances:
  - `/llms.txt` (curated index) and `/llms-full.txt` (full doc concat) now generated by Hugo. Per-page Markdown mirrors land at `<page-url>/index.md` so agents can fetch raw docs without parsing HTML.
  - New cookbook at `/docs/recipes/` with 10 task-shaped, single-page recipes (BME280, button→LED, KV counter, daily cron summary, WS2812 rainbow, OLED display, Discord webhook, HA entity, two-device RPC, watch device logs).
  - New CLI doc pages: `/docs/cli/dev/`, `/docs/cli/build/`, `/docs/cli/login/`. New guide `/docs/guides/using-i2c/`. New single-page reference `/docs/concepts/device-api/`. New error reference under `/docs/errors/`.
  - Changelog moved from `/docs/resources/changelog/` to `/docs/changelog/` (301 redirect added).
  - Fixed `/docs/concepts/architecture/` page that documented a fictional `gpio_write` message protocol — now shows the real `set_gpio_state` shape and the typed helper `setGpioState`.
  - Fixed `/docs/quickstart/` page that had two `## Step 4` headings.

- Updated dependencies [d03b5ae]
  - @devicesdk/core@1.4.0

## 0.2.9

### Patch Changes

- 71aedb1: **Manual migration required:** in every `devicesdk.ts`, rename the `entrypoint:` field to `className:`. There is no alias — `devicesdk build/dev/deploy/flash` will fail fast with a rename hint until the file is updated. Also rename `pin_state` → `pin_state_update` if you have firmware older than this release flashed to a device.

  Consolidated DX refactor — closes a half-dozen first-day pit-of-failure traps in the scaffold/build/flash flow:
  - **@devicesdk/cli (BREAKING)**: rename the device config field `entrypoint` → `className`. The old field name was misleading (it sounds like a file path; it was actually a class name). No alias — projects that still reference `entrypoint` get a clear migration error from config parse. The scaffold (`devicesdk init`) now writes `main`, `className`, `deviceType`, and `wifi` placeholders together, producing a config that validates out of the box. Wifi placeholders (`YOUR_WIFI_SSID`, `YOUR_WIFI_PASSWORD`) are rejected at config parse so you can't accidentally deploy with the scaffold defaults.
  - **@devicesdk/cli**: scaffold templates now use named exports (`export class Device extends DeviceEntrypoint`). The Worker bundler imports user classes by name; a `export default class` produced a confusing "No matching export" error at deploy time. `devicesdk build` now validates the user file's exports up front and surfaces a tailored fix-up hint when the named export is missing.
  - **@devicesdk/cli**: scaffold `tsconfig.json` no longer sets `rootDir: "./src"` — that conflicted with `include: ["devicesdk.ts"]` (a root-level file) and broke `tsc --noEmit` on a fresh project.
  - **@devicesdk/cli + @devicesdk/api**: `devicesdk flash` now surfaces a tailored error when the API has no firmware artifact published for a Zod-accepted device_type. The API returns `code: "FIRMWARE_NOT_PUBLISHED"`; the CLI prints "Firmware for X is not yet published" with a build-from-source pointer instead of a bare 404.
  - **@devicesdk/core**: `PinStateUpdate` is now a discriminated union by `payload.mode` — digital reads carry `value: "high" | "low"`, analog reads carry `value: number`. Aligns the typed contract with what firmware actually emits. Firmware (Pico + ESP32) now emits the `pin_state_update` discriminator that types and consumers (DO broadcaster, dashboard) already expected; the previous `pin_state` mismatch silently dropped state events.
  - **@devicesdk/core**: ship `SSD1306.esp32c3OledVariant()` static factory — the 72×40 0.42″ panel always needs `columnOffset: 28`. Replaces the magic-number copy/paste in the docs.
  - **@devicesdk/website**: ESP32-C3 docs use the new `SSD1306.esp32c3OledVariant()` preset and note that the prebuilt `esp32c3-client.bin` may not be promoted yet (build from source in the meantime).
  - **@devicesdk/dashboard**: dashboard temperature template narrows on `payload.mode === 'analog'` to type-check against the new `PinStateUpdate` union.

- 394d469: UX fixes batched from a new-user trial — eight small papercuts, one PR:
  - **@devicesdk/cli**: `loadConfig` / `getConfigDir` now walk up parent directories to find `devicesdk.ts`, so `deploy`, `dev`, `flash`, `logs`, `status`, `inspect`, and `env` work from any subdirectory of a project. `--config` and `DEVICESDK_CONFIG` still short-circuit the walk.
  - **@devicesdk/cli**: `devicesdk logs` accepts optional positionals — both default from `devicesdk.ts`. With one positional it's treated as the device slug (project comes from config); with two, it's `[project] [device]` as before. Multi-device projects without a positional get a friendly "pass one as positional" error listing the available device slugs.
  - **@devicesdk/cli**: 4xx response bodies are no longer dumped to stderr on every API error. Auth-revoked sessions now print one line — `Session expired — run \`devicesdk login\`.`— instead of`Response body (401): { ... }`followed by paragraph-long advice. Run with`--verbose`to keep the raw dump for debugging. The`downloadDeviceFirmware`path picks up the same treatment, so`flash` is quieter on auth/server errors.
  - **@devicesdk/cli**: `flash` permission-denied error mentions the Arch Linux `uucp` group (not just Debian's `dialout`) and links to the docs page that ships a persistent `99-devicesdk-serial.rules` snippet.
  - **@devicesdk/api**: the device runtime no longer prepends `[<projectId>:<deviceId>]` to every `console.log/info/warn/error/debug` call. Persisted log entries were already prefix-free; this drops the redundant tag from Wrangler tail / runtime stdout. Devices already carry their identity via the watcher URL.
  - **@devicesdk/simulation**: when the local dev server restarts after a file edit, the simulator UI now auto-reconnects with exponential backoff (1 s → 30 s) and shows a "Local server restarted — reconnecting…" banner instead of silently going dead until the user refreshes the browser.
  - **@devicesdk/website**: new `concepts/identifiers` page explains project slug vs device slug vs the underlying UUIDs in one place. The CLI reference index now points at it. The `flash` page documents serial-port permissions for both Debian-style (`dialout`) and Arch (`uucp`) systems, ships a copy-pasteable `99-devicesdk-serial.rules` udev snippet for CP210x / CH340 / FTDI bridges, and adds a "Verify connectivity" subsection pointing at `devicesdk status` after the LED sequence. The pin-read example on the first-device page is now a complete copy-pasteable snippet showing how to discriminate digital vs analog reads.

- Updated dependencies [71aedb1]
  - @devicesdk/core@1.3.0

## 0.2.8

### Patch Changes

- fd6e829: ESP32-C3 0.42″ OLED ergonomics + local-dev fixes:
  - **firmware/esp32**: paint boot status (`Booting` → `WiFi` → `Server`) on the on-board OLED for FN4 / "0.42 OLED" boards. The firmware probes `0x3C` at boot via `i2c_master_probe`; boards without an OLED (DevKitM-1) get a fast NACK and silently skip. Replaces the WS2812-only feedback that was invisible on FN4 boards (no LED wired to GPIO 8).
  - **firmware/esp32**: detect plain-HTTP local API hosts (`<lan-ip>:<port>`) and dial `ws://` instead of `wss://`, so flashing against `localhost:8787` works without a TLS cert.
  - **@devicesdk/api**: throw an explicit error from the `/v1/auth/google` route when `GOOGLE_ID`/`GOOGLE_SECRET` are missing — Sentry captures the misconfiguration cleanly instead of returning a generic chanfana validation error.
  - **@devicesdk/core**: update `columnOffset` comments to point at `28` (most common on FN4 0.42″ boards) and note `30`/`32` variants exist.
  - **@devicesdk/website**: document `columnOffset: 28` for the 0.42″ 72×40 panel and add a troubleshooting note for the leftmost vertical-stripe artifact (panel-offset mismatch / stale RAM).

- c19ce77: Logs-quota runaway fix + layered rate-limit defense:
  - **@devicesdk/api (breaking)**: deprecate `GET /v1/projects/:projectId/devices/:deviceId/logs` — the endpoint now returns `410 Gone` with `Link: …/watch>; rel="alternate"` and `code: "LOGS_DEPRECATED"`. The corresponding DO RPC `BaseDevice.getLogs` throws on call. A stale CLI `--tail` polling loop in May 2026 burned the daily Durable Object rows-read free-tier quota in ~5 hours each day; the polling pattern is now structurally impossible.
  - **@devicesdk/api**: watcher WebSocket (`/watch`) gains `?backfillLimit=N&backfillLevel=warn` query parameters. On connect the server emits up to N replay frames (`{ event: "log", data, replay: true }`, oldest-first) followed by a single `{ event: "history_complete" }` marker, then live broadcasts as before. One SQL scan per connection instead of per HTTP poll.
  - **@devicesdk/api**: add `TieredCache` (`caches.default` L1 → KV L2 with back-fill) and a single `CACHE` KV namespace. Two consumers: `userBlockListMiddleware` (mounted post-auth — 429s blocked users at the edge of the worker without touching D1 or the DO) and `authCache.ts` (caches `authenticateUser` lookups for 60 s, dropping ~95% of D1 reads per request on active tokens). Logout / onboarding completion / account-deletion request all invalidate the entry.
  - **@devicesdk/api**: when the per-user rate limit fires, also write a 1-hour cross-route block to `CACHE` so subsequent requests 429 immediately. Per-user rate limit is now scoped to `/logs` only (other routes are protected by tier limits inside their handlers and the WAF rule below).
  - **@devicesdk/cli (breaking)**: `devicesdk logs` and `devicesdk logs --tail` now use the watcher WebSocket exclusively. Both modes accept `--lines` and `--level`; the polling loop is gone. `--tail` reconnects with exponential backoff (1 s → 30 s) and bails with a non-zero exit code after 5 consecutive failures.
  - **@devicesdk/dashboard**: device logs panel migrates to WS-only. `useDeviceStream` accepts `{ backfillLimit, backfillLevel }` and exposes a `historyLoaded` ref; the panel shows a "Loading recent logs…" spinner until `history_complete` fires. The "Live" toggle and "Load More" button are removed — backfill + live are one stream.
  - **@devicesdk/website**: documents the manual Cloudflare WAF rate-limit rule under `docs/internal/operations/cloudflare-waf.md` and the new auth-cache / block-list architecture in CLAUDE.md.

  **Manual deploy steps** (also in the PR description):
  1. KV namespace IDs are already in `apps/api/wrangler.jsonc` (created in this branch).
  2. Apply the WAF rule per `docs/internal/operations/cloudflare-waf.md`.

- 7357c22: Upgrade `vitest` 3.2.4 → 4.1.5 and `@cloudflare/vitest-pool-workers` 0.11.1 → 0.15.2 across the monorepo:
  - **`apps/api/tests/vitest.config.mts`** rewrite for the new pool-workers shape: imports `defineConfig` from `vitest/config` and the `cloudflareTest` Vite plugin from `@cloudflare/vitest-pool-workers` (the `/config` subpath was removed, and `defineWorkersConfig` no longer exists). The wrangler `configPath` is now resolved relative to the project root, so it's passed as an absolute path. Test miniflare `compatibilityDate` synced to `2026-04-24` to match `wrangler.jsonc`.
  - **Test isolation regression** caused by removal of `isolatedStorage`: D1/KV/Cache writes now persist between `it()` blocks within a file. Added per-suite cleanup in `tokens.test.ts`, `scripts.test.ts` (with the inner `beforeAll` script-upload blocks converted to `beforeEach` so they re-seed after the wipe), and `devices.test.ts`. `blockList.test.ts` and `rateLimitBlock.test.ts` now also purge the matching `caches.default` Request after deleting from KV — `TieredCache` writes to both layers, and L1 staleness was tripping the path-scoped middleware test.
  - **`packages/cli/src/commands/logs.test.ts`**: vitest 4 rejects arrow-function implementations passed to `vi.fn()` when the mock is invoked with `new`. The `ws` mock now references a top-level `function` declaration (which biome leaves untouched) instead of an inline arrow.
  - **`apps/dashboard/package.json`**: `vitest` aligned to the workspace catalog so all three test-using packages share one version.
  - **catalog bumps** in `pnpm-workspace.yaml`: `vitest`/`@vitest/runner`/`@vitest/coverage-istanbul`/`@vitest/snapshot` → `^4.1.5`, `wrangler` → `^4.87.0`. `@cloudflare/workers-types` → `^4.20260501.1` in `apps/api`.

  No production-runtime behavior changes; this is dev-tooling only.

- Updated dependencies [fd6e829]
  - @devicesdk/core@1.2.1

## 0.2.7

### Patch Changes

- 1d0fc62: Fix `DataCloneError: ServiceStub serialization requires the 'experimental' compat flag` thrown by user scripts on every `env.DEVICE.<method>(...)` call. The `safeDevice` Proxy in `classProxy.ts` was returning `target[prop].bind(target)`, but `publicEnv.DEVICE` is an RPC stub — the runtime interpreted `.bind` as a remote method call rather than `Function.prototype.bind`. Returning the property reference directly avoids the serialization path. User scripts can now drive devices end-to-end.
- 63100ef: Defer user-worker `onDeviceConnect` and unsolicited `onMessage` invocations to a Durable Object alarm instead of running them inside the Hibernation-API `webSocketMessage` handler. Invoking the Worker Loader (`getTarget()`) from the hibernation handler hangs in production — scripts never ran on device connect, the OLED never rendered, `gpio_state_changed` events were dropped, and no error ever surfaced. Events are now persisted to a `__internal:pending_user_events` queue and drained from `alarm()`, which runs in a fresh invocation context where Worker Loader works as expected.
- 3d81d40: Cut Durable Object `rows_read` overhead on the device WebSocket hot path. Each idle keepalive ping previously cost ~7 storage row reads — `restoreMessageCount` (2) + `getDeviceMeta` (1) + `enqueueUserWorkerEvent` (1) + the immediately-following alarm fire (3) — burning the daily quota on the free tier with one connected device. This change short-circuits the `webSocketMessage` handler when `message.type === "ping"` so keepalives no longer touch storage, removes a redundant `PENDING_USER_EVENTS_KEY` re-read inside `alarm()` (any new event enqueued during drain already arms its own alarm), caches a `_hasCrons` tristate so devices without cron schedules skip the `CRON_STORAGE_KEY` read on every alarm, and throttles the `device_logs` overflow-cleanup query (which scans up to `LOG_MAX_STORED` rows) from "every 10 writes" to "every 100 writes AND no more than once per 6 hours".
- 0ce8958: Cache the user-worker stub on the Device Durable Object instance so that repeated `LOADER.get()` + `getEntrypoint().getTarget()` calls don't trip the runtime's "Too many concurrent dynamic workers" limit. Without caching, every alarm drain, inter-device RPC, and cron dispatch resolved a fresh stub for the same `workerId`; under normal traffic this caused `getOrCreateUserWorker` to fail with `Too many concurrent dynamic workers`, the alarm queue to retry through 1→2→4→8→16 s backoff, and `onDeviceConnect` / `onMessage` to be silently dropped after `MAX_USER_EVENT_ATTEMPTS`. The cache is keyed by `${projectId}:${deviceId}:${versionId}`, so a script redeploy invalidates it automatically; DO eviction discards it naturally.

## 0.2.6

### Patch Changes

- af3e023: Recalculate ESP-IDF image checksum for ESP32-C3 firmware downloads. Previously only `esp32` and `esp32c61` had their checksums recalculated after credential patching, so credential-patched `esp32c3` binaries carried stale checksums and would fail image validation at boot. The condition now covers every `esp32*` variant.

## 0.2.5

### Patch Changes

- e53d79f: Add ESP32-C3 as a supported device type.
  - Firmware: new `sdkconfig.defaults.esp32c3` (WS2812 on GPIO 8); `Kconfig.projbuild` defaults addressable LED on for the C3 target; `hal.c` branches on `SOC_RMT_SUPPORTED` and uses the RMT backend for led_strip on C3 (C61 keeps the SPI backend).
  - Build & CI: `firmware/esp32/package.json` `build:all` + `publish` now emit and upload `esp32c3-client.bin`. The `firmware-esp32` GitHub workflow is converted to a target matrix (`esp32`, `esp32c61`, `esp32c3`) with per-target R2 uploads on main.
  - API: `POST /v1/projects/:p/devices/:d/firmware` accepts `device_type: "esp32c3"`. The ESP branch now uses `startsWith("esp32")` to route any ESP variant to `<target>-client.bin`.
  - CLI: `DeviceType` gains `"esp32c3"`; `isEsp32DeviceType` simplified to `startsWith("esp32")`; `getEsp32ChipName` returns `"esp32c3"` for the new target, and `devicesdk flash` routes C3 devices to `flashESP32` with `--chip esp32c3`. Tests cover the new device type in `config.test.ts` and `flash.test.ts`.

- Updated dependencies [e53d79f]
  - @devicesdk/core@1.2.0

## 0.2.4

### Patch Changes

- 2babb84: Add `openapi` and `build` scripts that generate a static `openapi.json` via `npx chanfana` during the Turbo build graph. Enables the marketing website to serve an interactive Swagger UI at `/api/docs` sourced from the live schema, without exposing the API's auth-gated runtime docs endpoint.
- 23b8924: - Fix `devicesdk init` template: declare `@devicesdk/core` as a runtime dep of the CLI so resolved versions reflect the installed package (was hardcoded `^0.0.1`); install with the package manager that invoked the CLI (pnpm, yarn, npm, or bun) via `npm_config_user_agent` detection.
  - Expose `./package.json` in `@devicesdk/core` package exports so version lookups via `createRequire` / `require.resolve` work under Node's `exports`-enforced resolution.
  - Return a 500 JSON error when UF2 firmware validation fails after patching, instead of a 200 response with an `X-Firmware-Validation: failed` header that most clients would ignore.
  - Add a safety comment in the device Durable Object explaining the in-memory `logWatchers` cleanup behavior across hibernation.
- 7900434: - Extract duplicate project+device lookup into `foundation/projectDeviceResolve.ts`, used by `getDevice`, `updateDevice`, `deleteDevice`, `sendCommand`, and `watchDevice`.
  - Centralize dashboard API host in `config/apiHost.ts` with a `VITE_API_HOST` env override; four call sites now read from one source.
  - Add `DEVICESDK_SIMULATOR_ASSETS_PATH` env override for `devicesdk dev` when the packaged simulator assets are unavailable.
  - Introduce canonical CLI exit code constants (`packages/cli/src/exitCodes.ts`) and document them in `docs/cli/_index.md`. All 48 `process.exit()` call sites now use named constants.
  - Remove order-dependent 403-retry pattern in `limits.test.ts` by resetting the free user's projects in `beforeEach`.
  - Deduplicate firmware base64 primitives into a shared header-only `firmware/common/base64_core.h` used by both the ESP32 (C) and Pico (C++) implementations.
  - Delete the orphaned `firmware/pico/lib/lwip_ws/ws_client.c` stub (the real implementation lives in `ws_client.cpp`).
- Updated dependencies [23b8924]
  - @devicesdk/core@1.1.2

## 0.2.3

### Patch Changes

- d44efa3: Render privacy policy and terms of service pages from markdown content instead of hardcoded HTML in Hugo layouts.

## 0.2.2

### Patch Changes

- 618636f: Add error handling for DO RPC calls, R2 operations, and script validation; fix npm package metadata and README
- 6ba99ed: Security and quality improvements for public launch: 401 session handling, logout error handling, UF2 validation surfacing, redirect URL validation consolidation, security headers, privacy policy, terms of service, CLI version fix, and core README update.
- Updated dependencies [618636f]
- Updated dependencies [6ba99ed]
  - @devicesdk/core@1.1.1

## 0.2.1

### Patch Changes

- e2b18c1: Pre-launch quality fixes: onboarding_completed backend flag, ENV misconfiguration guard, Sentry user context and error capture, and onboarding wizard wired to backend state

## 0.2.0

### Minor Changes

- 5d8f9da: Add CLI token list and revoke endpoints (GET /v1/tokens/cli, DELETE /v1/tokens/cli/:tokenId) and display CLI sessions in the dashboard tokens page with revoke support.
- 5d8f9da: Add offset-based pagination to ListProjects, ListDevices, and ListApiTokens endpoints. Response format changes from a flat array to `{ items: [...], page: number, per_page: number, has_more: boolean }`. Both the dashboard and CLI auto-paginate to fetch all pages transparently.
- 9ab6698: Add hardware peripheral support: SPI, UART, watchdog timer, on-die temperature sensor, I2C batch write (ESP32), and PIO WS2812 addressable LEDs (Pico). Includes full-stack implementation across firmware, core types, device sender, API, CLI inspect REPL, and simulator.
- 00991a8: Add Home Assistant integration support across the stack:
  - **Generic watch WebSocket** (`GET /v1/projects/:projectId/devices/:deviceId/watch`) delivers real-time `status`, `log`, and structured `state` events over a single hibernation-friendly connection. Replaces the legacy SSE log stream as the canonical real-time primitive. The dashboard now uses this endpoint.
  - **`emitState(entityId, value)` SDK method** on `DeviceSenderInterface` lets device scripts publish structured telemetry to watchers (custom sensors, I2C readings, derived values).
  - **Auto-emitted state events** for built-in hardware messages: `gpio_state_changed`, `pin_state_update`, and `temperature_result` are broadcast as structured `state` events without requiring `emitState` calls.
  - **`HaEntityDeclaration` types** in `@devicesdk/core` for declaring Home Assistant entities.
  - **`ha.entities` config key** in `devicesdk.ts` — the CLI's `deploy` command uploads these declarations to the new `GET/PUT /entities` endpoints after a successful script push.

- 59cb75a: Add `devicesdk inspect <device-id>` interactive hardware inspection CLI command. Opens a REPL for exploring device hardware (GPIO read/write, ADC, PWM, I2C scan/configure/read/write, input monitoring, reboot) without writing a device script. Backed by a new `POST /v1/projects/:projectId/devices/:deviceId/command` API endpoint.
- 1c28cba: Add project-scoped environment variables for device scripts.

  Device scripts can now access secrets via `this.env.VARS.get("KEY")` without hardcoding them in source code. Variables are managed per-project with CLI commands (`devicesdk env set KEY=VALUE`, `env list`, `env unset KEY`) and stored securely outside of device scripts.

- 5d8f9da: Add soft account deletion with 7-day grace period and hourly session cleanup cron. Users can request account deletion via DELETE /v1/user/me, which sets a grace period and immediately revokes all sessions. Auth is refused for pending-deletion accounts. A scheduled handler purges expired accounts, sessions, rate limits, and CLI auth codes.
- bc9bd88: Add tier-based usage limits, per-user API rate limiting, and abuse prevention. Introduces Free/Paid plan system: resource limits on project, device, script version, API token, and env var creation; per-user rate limiting (60/120 req/min); per-device daily message counting in Durable Objects with firmware support for rate-limit reconnect delays. Enriches /v1/user/me with plan, limits, and usage fields.
- 5d8f9da: Add user suspension mechanism (suspended_at column, 403 response on all auth paths) and standardize API error responses to use singular `error` key instead of `errors` array.

### Patch Changes

- 09491be: Add integration tests for the PUT /v1/projects/:projectId (update project) endpoint
- 06c2f2d: Allow an optional `description` field when creating API tokens via `POST /v1/tokens`
- aa8f82d: Add missing integration test for partial device update (name-only update preserves description)
- 69ef4a1: Replace hard script version limit with FIFO auto-pruning: when a device is at its version cap, the oldest non-current versions are automatically deleted to make room for new uploads. Also exclude managed device tokens from the user API token count so device firmware tokens don't consume user token slots.
- d000911: Add integration tests for the firmware download endpoint covering 401, 404 (project/device/firmware not found), happy path response headers, and managed token creation
- b61368c: Fix device and project slug validation to prevent unhandled ZodError rejections in Zod v4

  Move slug format validation from the Zod schema `.regex()` call into the request handler for `createDevice` and `createProject`. This matches the pattern already used in `batchUpload` and prevents a Zod v4 async validation bug from leaking unhandled promise rejections that caused the test runner to exit with code 1. Also unskips the previously-disabled `should return 400 if project_slug is invalid format` test and adds equivalent 400 validation tests for `createDevice`.

- 1c66ffd: Add missing 404 (non-existent project) and 401 (unauthenticated) tests for the get device endpoint
- bb42ae3: Security hardening and real-time dashboard features: add CSRF protection to CLI approval form, fix RPC proxy env mutation concurrency with scoped Proxy, embed TLS root CA in Pico firmware for server identity verification, add SSE-based real-time log streaming endpoint, add API test coverage reporting with Istanbul, harden cron name log sanitization, and document UF2 checksum safety.
- 8658a45: Add missing 401 and 404 integration tests for the list script versions endpoint
- 137513c: Add missing 401 auth guard tests for GET /v1/projects, GET /v1/projects/:projectId, and DELETE /v1/projects/:projectId
- 845fd6f: Add missing 404 and 401 tests for GET script, GET version, and deploy version endpoints
- 0f80c0c: Fix critical and high security vulnerabilities: use cryptographically secure random for session and CLI auth tokens, hash API tokens before storage (SHA-256), fix CSRF cookie SameSite policy, invalidate sessions on logout, add rate limiting on auth endpoints, sanitize approval page HTML, strip error details in production, and restore Zod schema validators via chanfana safeParseAsync patch.
- 020f983: Add missing 401 and 404 tests for script upload endpoints
- 5c4caad: Add integration tests for GET /v1/user/me endpoint
- Updated dependencies [c9a38e3]
- Updated dependencies [9ab6698]
- Updated dependencies [00991a8]
- Updated dependencies [1c28cba]
  - @devicesdk/core@1.1.0

## 0.1.0

### Minor Changes

- bc3493a: Add device logging pipeline: console.log/info/warn/error/debug in user device scripts are automatically captured, persisted to per-device storage, served via GET /v1/.../logs endpoint, and displayed in dashboard Logs tab.

  Breaking: removed `LoggerInterface` and `LOGGER` from `UserWorkerEnv` in `@devicesdk/core`. Use `console.log`/`console.info`/etc. instead of `this.env.LOGGER.info()` — logging is now handled transparently via console override.

- bdd52f7: Add inter-device communication (RPC): devices within the same project can call public methods on each other via `this.env.DEVICES["slug"].method()` with full TypeScript autocomplete, return types, and graceful offline handling.

  ### `@devicesdk/core`
  - New type `RemoteDevice<T>` — extracts public non-lifecycle methods from a device class
  - New type `GetEnv<ProjectDevices>` — generates the full `Env` type with `DEVICE` and `DEVICES` bindings
  - `DeviceEntrypoint` now accepts an `Env` type parameter for type-safe inter-device access

  ### `@devicesdk/api`
  - New `DevicesBridge` WorkerEntrypoint routes RPC calls between Durable Objects
  - `BaseDevice.handleRemoteCall()` loads user scripts and dispatches method calls
  - `classProxy` generates nested JS Proxy for `this.env.DEVICES` and exposes `callMethod` with lifecycle method blocking
  - Max call depth of 3 prevents infinite cycles (A → B → A)

  ### `@devicesdk/cli`
  - `devicesdk build` now generates `devicesdk-env.d.ts` alongside `devicesdk.ts` with `ProjectDevices` type map and `Env` helper

  ### Examples

  ```typescript
  // src/devices/sensor.ts — call a method on another device
  import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";
  import type { Env } from "../../devicesdk-env";

  export class Sensor extends DeviceEntrypoint<Env> {
    async onMessage(msg: DeviceResponse) {
      if (msg.type === "gpio_state_changed" && msg.payload.pin === 20) {
        // Type-safe! Autocomplete shows turnOn, turnOff, updateDesiredState
        const result = await this.env.DEVICES["light-controller"].turnOn();
        console.info("Light turned:", result.status);
      }
    }
  }
  ```

  ```typescript
  // src/devices/light.ts — expose methods for other devices to call
  import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";
  import type { Env } from "../../devicesdk-env";

  export class LightController extends DeviceEntrypoint<Env> {
    async turnOn() {
      await this.env.DEVICE.setGpioState(5, "high");
      return { status: "on" as const };
    }

    async turnOff() {
      await this.env.DEVICE.setGpioState(5, "low");
      return { status: "off" as const };
    }

    // KV writes work even when hardware is offline
    async updateDesiredState(state: { brightness: number }) {
      await this.env.DEVICE.kv.put("desired", state);
    }

    async onDeviceConnect() {
      const desired = await this.env.DEVICE.kv.get<{ brightness: number }>(
        "desired",
      );
      if (desired) {
        console.info("Applying saved brightness:", desired.brightness);
      }
    }

    async onMessage(msg: DeviceResponse) {}
  }
  ```

  ```typescript
  // devicesdk.ts — no changes needed, just define your devices
  import { defineConfig } from "@devicesdk/cli";

  export default defineConfig({
    projectId: "smart-home",
    devices: {
      "light-controller": {
        main: "./src/devices/light.ts",
        entrypoint: "LightController",
        deviceType: "pico-w",
        wifi: { ssid: "...", password: "..." },
      },
      sensor: {
        main: "./src/devices/sensor.ts",
        entrypoint: "Sensor",
        deviceType: "pico-w",
        wifi: { ssid: "...", password: "..." },
      },
    },
  });
  ```

  Run `devicesdk build` to generate `devicesdk-env.d.ts` with the `Env` type, then import it in your device files.

### Patch Changes

- 211a1d8: Add missing test coverage for devices endpoint: 404 cases for PUT (non-existent device and project), 404 for GET list with non-existent project, and 401 unauthorized tests for POST, GET list, PUT, and DELETE endpoints
- 93bedec: Fix DELETE /v1/projects/:projectId returning `project_id` instead of `project_slug` in response body
- 3940fd0: Fix DELETE /v1/tokens/:tokenId returning 200 for non-existent tokens instead of 404
- 395c433: Fix R2 path mismatch in script upload endpoints that caused GET /script and GET /versions/:versionId to always return 404

  Both `uploadScript` and `batchUpload` were writing script files to R2 using internal UUID-based paths (`{userId}/{project.id}/{device.id}/...`), while `getScript`, `getVersion`, and `deployVersion` read using slug-based URL params (`{userId}/{projectSlug}/{deviceSlug}/...`). This meant the reading endpoints could never locate uploaded scripts. Additionally, neither upload endpoint wrote a `latest.js` file, which `getScript` requires.

- 07ed6ed: Remove unused `ApiException` imports from 16 API endpoint files
- Updated dependencies [bc3493a]
- Updated dependencies [bdd52f7]
  - @devicesdk/core@1.0.0
