# @devicesdk/cli

## 0.7.1

### Patch Changes

- 2905d82: docs: recommend `devicesdk login` without `--host` as the default path

  The CLI already auto-discovers the server over mDNS, so `--host` is only needed
  when mDNS is unavailable (some corporate/VPN networks), when using a custom
  `MDNS_HOSTNAME`, or when the CLI runs on the same machine as the server. Updated
  README, quickstart, CLI login reference, MCP docs, troubleshooting guide, error
  reference, examples, and agent skills manifest to reflect this.

- 79dcc96: Update all GitHub repo and Docker image references from `device-sdk/devicesdk-monorepo` to `device-sdk/devicesdk` following the GitHub repository rename.
- Updated dependencies [79dcc96]
  - @devicesdk/core@1.4.5

## 0.7.0

### Minor Changes

- 0ec78d4: Add mDNS discovery fallback when the CLI has no configured server URL.

  If `DEVICESDK_API_URL`, `--host`, and stored credentials are all absent, the CLI
  multicasts an mDNS A-record query for `<DEVICESDK_MDNS_HOSTNAME>.local` (default
  `devicesdk.local`) and uses the first response as `http://<ip>:8080`. The
  hostname and port can be overridden with `DEVICESDK_MDNS_HOSTNAME` and
  `DEVICESDK_MDNS_PORT`. Covered by unit tests for the wire codec and the
  discovery timeout/success paths.

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

- Updated dependencies [e299282]
  - @devicesdk/core@1.4.4

## 0.6.0

### Minor Changes

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

- 874cd73: Follow-up docs cleanup: fix stale cloud-era references that survived the
  self-host pivot.
  - **Public docs (`docs/public/`)**: corrected `troubleshooting.md` (dropped
    "edge script/edge location", Cloudflare-era queues, the dead
    `status.devicesdk.com` status page, the hardcoded port-443 firewall note, and
    the request-quota framing - the server only rate-limits auth brute-force);
    fixed `concepts/env-vars.md` (`DeviceSender` → `DeviceEntrypoint` + import),
    `guides/home-assistant.md` (`defineConfig` import from `@devicesdk/cli`, repo
    URL), `cli/init.md` (documented the real `--no-git` flag, removed the
    non-existent `--name`), `cli/deploy.md` (removed the non-existent
    `deploy --version`), `hardware/esp32-c61.md` (`devicesdk-client.bin` →
    `esp32c61-client.bin`), broken `github.com/device-sdk` org-root links, and a
    stray `</content></invoke>` artifact at the end of `resources/faq.md`. Trimmed
    the obsolete Cloudflare/Durable-Object/OAuth "Platform Roadmap" section from
    the (unpublished) `docs/public/ROADMAP.md`.
  - **Marketing site (`apps/website`)**: removed the dead cloud-billing model from
    the Solutions page ("Estimated cost / Free tier / ~$0.60/month / daily limit"
    → "Self-hosted"); fixed `export default class` hero/product code samples to
    the required named `export class`; "cloud KV" → "device KV"; rewrote the
    website `README.md` (it still described the old pure-HTML/jQuery/Wrangler
    setup - it's a Hugo + Tailwind site now, still deployed to Cloudflare Pages).
    Also pointed every "GitHub" link (the `githubUrl` param, nav/footer menus,
    footer license link, about page, terms/privacy) at the repo
    (`device-sdk/devicesdk`) instead of the bare org root, and aligned a
    "KV namespace" → "KV store" code comment with the rest of the self-host copy.
  - **Package READMEs**: `@devicesdk/core` ("sandboxed serverless runtime" →
    in-process on the self-hosted server), `@devicesdk/cli` (`login` now needs
    `--host`), `@devicesdk/mcp` (`auth.json` → `credentials.json`).
  - **Firmware (`firmware/pico/README.md`)**: rewrote the stale "devicesdk-client"
    README (cloud backend, port 8787, personal absolute paths) and scrubbed the
    committed Wi-Fi credentials / API tokens it documented. Docs only - no
    firmware behavior change.
  - **Firmware (`firmware/esp32/`)**: rewrote the bare ESP-IDF "Hello World"
    `README.md` into a real DeviceSDK ESP32 firmware doc, rewrote the
    Pico-porting-guide `IMPLEMENTATIONS.md` into an accurate ESP32 architecture
    reference, deleted the redundant `PROJECT_SUMMARY.md` (leaked personal path +
    wrong CC0 license claim), and dropped the obsolete Cloudflare Durable-Object
    billing rationale from a `config.h` comment. Docs/comment only.

- f724c46: Migrate CLAUDE.md and `.claude/skills/` to `AGENTS.md` and OpenCode-compatible `.opencode/skills/` and `.opencode/commands/`. `devicesdk init` now scaffolds `AGENTS.md` only (no longer `CLAUDE.md`), and MCP docs mention OpenCode alongside Claude and Cursor. Also hardens CI: dashboard E2E tests retry once in CI, pnpm install is retried after clearing the store, release builds have Bun available, and firmware rolling releases recreate immutable releases.
- 3a72934: Self-host release readiness pass
  - Added `KNOWN_NOT_ISSUES.md` documenting the npm Trusted Publishers release setup.
  - Fixed dashboard token snippet and redirect allow-list for custom self-hosted origins.
  - Added `apps/server/.env.example` and a `TRUST_PROXY` setting so rate limiting safely handles reverse proxies.
  - Removed stale cloud-era wording from `@devicesdk/core`, the CLI `init` template, and `examples/AGENTS.md`.
  - Corrected OTA firmware claims in docs until the feature ships.
  - Updated `TROUBLESHOOT.md` to reference self-hosted dashboard URLs and generic proxy/CDN guidance.
  - Added `data/` directories to `.gitignore`, pinned the Bun version in `Dockerfile` to `1.3.14`, and renamed `durableObjectStub.ts` to `deviceHandle.ts`.
  - Documented the intentionally skipped migration `0003` in `apps/server/migrations/README.md`.

- Updated dependencies [874cd73]
- Updated dependencies [3a72934]
- Updated dependencies [6d0a71b]
  - @devicesdk/core@1.4.3

## 0.5.2

### Patch Changes

- 0334095: Audit cleanup (correctness, tech-debt, deps, CI):
  - **dashboard:** fix a watcher-WebSocket reconnect storm in `useDeviceStream` - `onerror`+`onclose` both fired the reconnect handler, scheduling duplicate reconnects and leaking the first timer (which `disconnect()` could then no longer cancel). Each socket now reconnects at most once per drop.
  - **api:** script-validation `400`s now include the canonical `error` string (alongside the structured `errors`), so `devicesdk deploy` surfaces the real validation messages instead of a generic "Request failed with status 400".
  - **cli:** `dev` now scans for a genuinely-free fallback port instead of picking one random port that could itself be in use; the Linux `lsblk` volume parser no longer truncates labels/mountpoints containing `=`; `logs --tail` bounds its `seenIds` dedup set in long-running sessions.
  - **core/api/cli:** centralized the script-size limit as `MAX_SCRIPT_SIZE_BYTES` in `@devicesdk/core`, consumed by the API upload validation and the CLI pre-deploy check (one source of truth).
  - **firmware (esp32 + pico):** fix `i2c_write` on real hardware - the handlers required a base64 string, but the SDK sends (and `i2c_batch_write`/SPI accept) a hex-string array, so writes were silently dropped on a device. Both handlers now parse the hex-string array.
  - **dashboard:** removed unused Quasar scaffolding; de-duplicated the `normalizeTimestamp`/`formatDate` helpers into `lib/time.ts`.
  - **api (security):** bumped `hono` 4.10.7 → 4.12.23 (clears several advisories; the affected JWT middleware is unused) and pinned `chanfana` to exact `3.3.0` to match its patch target. Also bumped `@sentry/cloudflare` and (dashboard) `axios` to latest.
  - **repo/CI:** untracked the vendored ESP-IDF `managed_components/` (re-fetched at build time via `idf_component.yml`); added minimal `permissions: { contents: read }` to `ci.yml`/`deploy.yml`; SHA-pinned all third-party GitHub Actions; bumped `turbo`; reconciled the ESP-IDF version in docs to match CI (`v5.5.1`).

- Updated dependencies [0334095]
  - @devicesdk/core@1.4.2

## 0.5.1

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

## 0.5.0

### Minor Changes

- d03b5ae: Major AI-agent-friendliness pass across the SDK so users' coding agents (Claude, Cursor, Copilot, Aider, etc.) can work in DeviceSDK projects with the right context on the first try.

  **`@devicesdk/core`** - additive only:
  - Ships `AGENTS.md` inside the npm tarball (`node_modules/@devicesdk/core/AGENTS.md`) - version-matched API guidance for agents.
  - Ships the full `docs/` folder (guides, examples) inside the tarball.
  - JSDoc with runnable `@example` blocks added to every method on `DeviceSenderInterface`. Lifecycle hooks on `DeviceEntrypoint` (`onDeviceConnect`, `onDeviceDisconnect`, `onMessage`, `onCron`) now carry block-comment JSDoc that survives into the `.d.ts`.
  - New: branded ID types (`ProjectId`, `DeviceId`, `ScriptId`, `TokenId`) plus boundary constructors (`asProjectId`, `asDeviceId`, …) for nominal-style ID safety.
  - New: `OnboardLED = 99` constant for portable LED code across Pico W, Pico 2 W, ESP32-C3, ESP32-C61.
  - New: literal pin unions in `@devicesdk/core/devices/pico` (`PicoGpioPin`, `PicoAdcPin`, `PicoPwmPin`) and a new subpath `@devicesdk/core/devices/esp32` (`Esp32GpioPin`, `Esp32C3GpioPin`, `Esp32C61GpioPin`, etc.).
  - Expanded npm `keywords` and pointed `homepage` at `/docs/`.
  - Fixed: README hello-world snippet referenced a nonexistent `this.ctx.device.log` API; now uses `console.log` and properly types `onMessage(message: DeviceResponse)`.

  **`@devicesdk/cli`** - additive only:
  - `devicesdk init` now scaffolds `AGENTS.md`, `CLAUDE.md` (one-line `@AGENTS.md`), `.cursor/rules/devicesdk.mdc`, `.mcp.json` (preconfigured for `@devicesdk/mcp`), and a project `README.md`.
  - `devicesdk init` no longer scaffolds `onMessage(message: any)` - templates use `onMessage(message: DeviceResponse)` and demonstrate inter-device RPC.
  - `devicesdk build` now emits `import type { UserWorkerEnv }` instead of the deprecated `GetEnv` alias in `devicesdk-env.d.ts`.
  - New `--json` flag on `whoami`, `status`, `logs`, `env list` (output `{success, result|error}`). `logs --tail --json` emits NDJSON. `DEVICESDK_OUTPUT=json` works as a global toggle.
  - `DeviceSDKApiError` now carries an optional `docs` URL alongside the existing `code`. `parseErrorBody` extracts both. Added `invalid_cli_token` and `missing_credentials` to the auth-expired set so the CLI surfaces the right "run `devicesdk login`" hint.
  - Help text gained "More: <docs-url>" footers.

  **`@devicesdk/mcp`** - new package:
  - `npx -y @devicesdk/mcp` runs an MCP stdio server exposing 7 tools to coding agents: `devicesdk_whoami`, `devicesdk_status`, `devicesdk_logs_tail`, `devicesdk_env_list`, `devicesdk_env_set`, `devicesdk_deploy`, `devicesdk_docs_search`.
  - Each tool wraps the equivalent `devicesdk <cmd> --json` invocation; auth is inherited from the CLI's `~/.devicesdk/auth.json`.

  **`@devicesdk/api`** - additive only:
  - `apps/api/src/foundation/auth.ts` now returns differentiated, machine-readable error codes (`missing_credentials`, `invalid_token`, `invalid_cli_token`, `account_suspended`, `account_deletion_pending`) and a `docs` URL pointing at the new `/docs/errors/<CODE>/` pages, in place of the previous catch-all `"Authentication error"` string.
  - `DeviceSender` (`apps/api/src/durableObjects/lib/deviceSender.ts`) now validates pin/range/I2C/SPI/UART/WS2812 arguments synchronously before round-tripping to firmware. Bad calls (`setGpioState(999, "high")`, `setPwmState(0, 0, 5.0)`, malformed I2C addresses, `pioWs2812Update([[256, 0, 0]])`, etc.) now throw a typed error with `code: "invalid_argument"` and a `docs` URL instead of silently returning a `command_error` event.

  **Behaviour change to note**: scripts that previously relied on `setGpioState(badPin, …)` round-tripping and surfacing as a `command_error` event in `onMessage` will now throw synchronously from the `await` site. Catch the error or fix the argument - the `docs` field on the thrown Error points at the right reference page.

  **`@devicesdk/website`** - content + agent affordances:
  - `/llms.txt` (curated index) and `/llms-full.txt` (full doc concat) now generated by Hugo. Per-page Markdown mirrors land at `<page-url>/index.md` so agents can fetch raw docs without parsing HTML.
  - New cookbook at `/docs/recipes/` with 10 task-shaped, single-page recipes (BME280, button→LED, KV counter, daily cron summary, WS2812 rainbow, OLED display, Discord webhook, HA entity, two-device RPC, watch device logs).
  - New CLI doc pages: `/docs/cli/dev/`, `/docs/cli/build/`, `/docs/cli/login/`. New guide `/docs/guides/using-i2c/`. New single-page reference `/docs/concepts/device-api/`. New error reference under `/docs/errors/`.
  - Changelog moved from `/docs/resources/changelog/` to `/docs/changelog/` (301 redirect added).
  - Fixed `/docs/concepts/architecture/` page that documented a fictional `gpio_write` message protocol - now shows the real `set_gpio_state` shape and the typed helper `setGpioState`.
  - Fixed `/docs/quickstart/` page that had two `## Step 4` headings.

### Patch Changes

- Updated dependencies [d03b5ae]
  - @devicesdk/core@1.4.0

## 0.4.0

### Minor Changes

- 71aedb1: **Manual migration required:** in every `devicesdk.ts`, rename the `entrypoint:` field to `className:`. There is no alias - `devicesdk build/dev/deploy/flash` will fail fast with a rename hint until the file is updated. Also rename `pin_state` → `pin_state_update` if you have firmware older than this release flashed to a device.

  Consolidated DX refactor - closes a half-dozen first-day pit-of-failure traps in the scaffold/build/flash flow:
  - **@devicesdk/cli (BREAKING)**: rename the device config field `entrypoint` → `className`. The old field name was misleading (it sounds like a file path; it was actually a class name). No alias - projects that still reference `entrypoint` get a clear migration error from config parse. The scaffold (`devicesdk init`) now writes `main`, `className`, `deviceType`, and `wifi` placeholders together, producing a config that validates out of the box. Wifi placeholders (`YOUR_WIFI_SSID`, `YOUR_WIFI_PASSWORD`) are rejected at config parse so you can't accidentally deploy with the scaffold defaults.
  - **@devicesdk/cli**: scaffold templates now use named exports (`export class Device extends DeviceEntrypoint`). The Worker bundler imports user classes by name; a `export default class` produced a confusing "No matching export" error at deploy time. `devicesdk build` now validates the user file's exports up front and surfaces a tailored fix-up hint when the named export is missing.
  - **@devicesdk/cli**: scaffold `tsconfig.json` no longer sets `rootDir: "./src"` - that conflicted with `include: ["devicesdk.ts"]` (a root-level file) and broke `tsc --noEmit` on a fresh project.
  - **@devicesdk/cli + @devicesdk/api**: `devicesdk flash` now surfaces a tailored error when the API has no firmware artifact published for a Zod-accepted device_type. The API returns `code: "FIRMWARE_NOT_PUBLISHED"`; the CLI prints "Firmware for X is not yet published" with a build-from-source pointer instead of a bare 404.
  - **@devicesdk/core**: `PinStateUpdate` is now a discriminated union by `payload.mode` - digital reads carry `value: "high" | "low"`, analog reads carry `value: number`. Aligns the typed contract with what firmware actually emits. Firmware (Pico + ESP32) now emits the `pin_state_update` discriminator that types and consumers (DO broadcaster, dashboard) already expected; the previous `pin_state` mismatch silently dropped state events.
  - **@devicesdk/core**: ship `SSD1306.esp32c3OledVariant()` static factory - the 72×40 0.42″ panel always needs `columnOffset: 28`. Replaces the magic-number copy/paste in the docs.
  - **@devicesdk/website**: ESP32-C3 docs use the new `SSD1306.esp32c3OledVariant()` preset and note that the prebuilt `esp32c3-client.bin` may not be promoted yet (build from source in the meantime).
  - **@devicesdk/dashboard**: dashboard temperature template narrows on `payload.mode === 'analog'` to type-check against the new `PinStateUpdate` union.

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

## 0.3.1

### Patch Changes

- c19ce77: Logs-quota runaway fix + layered rate-limit defense:
  - **@devicesdk/api (breaking)**: deprecate `GET /v1/projects/:projectId/devices/:deviceId/logs` - the endpoint now returns `410 Gone` with `Link: …/watch>; rel="alternate"` and `code: "LOGS_DEPRECATED"`. The corresponding DO RPC `BaseDevice.getLogs` throws on call. A stale CLI `--tail` polling loop in May 2026 burned the daily Durable Object rows-read free-tier quota in ~5 hours each day; the polling pattern is now structurally impossible.
  - **@devicesdk/api**: watcher WebSocket (`/watch`) gains `?backfillLimit=N&backfillLevel=warn` query parameters. On connect the server emits up to N replay frames (`{ event: "log", data, replay: true }`, oldest-first) followed by a single `{ event: "history_complete" }` marker, then live broadcasts as before. One SQL scan per connection instead of per HTTP poll.
  - **@devicesdk/api**: add `TieredCache` (`caches.default` L1 → KV L2 with back-fill) and a single `CACHE` KV namespace. Two consumers: `userBlockListMiddleware` (mounted post-auth - 429s blocked users at the edge of the worker without touching D1 or the DO) and `authCache.ts` (caches `authenticateUser` lookups for 60 s, dropping ~95% of D1 reads per request on active tokens). Logout / onboarding completion / account-deletion request all invalidate the entry.
  - **@devicesdk/api**: when the per-user rate limit fires, also write a 1-hour cross-route block to `CACHE` so subsequent requests 429 immediately. Per-user rate limit is now scoped to `/logs` only (other routes are protected by tier limits inside their handlers and the WAF rule below).
  - **@devicesdk/cli (breaking)**: `devicesdk logs` and `devicesdk logs --tail` now use the watcher WebSocket exclusively. Both modes accept `--lines` and `--level`; the polling loop is gone. `--tail` reconnects with exponential backoff (1 s → 30 s) and bails with a non-zero exit code after 5 consecutive failures.
  - **@devicesdk/dashboard**: device logs panel migrates to WS-only. `useDeviceStream` accepts `{ backfillLimit, backfillLevel }` and exposes a `historyLoaded` ref; the panel shows a "Loading recent logs…" spinner until `history_complete` fires. The "Live" toggle and "Load More" button are removed - backfill + live are one stream.
  - **@devicesdk/website**: documents the manual Cloudflare WAF rate-limit rule under `docs/internal/operations/cloudflare-waf.md` and the new auth-cache / block-list architecture in CLAUDE.md.

  **Manual deploy steps** (also in the PR description):
  1. KV namespace IDs are already in `apps/api/wrangler.jsonc` (created in this branch).
  2. Apply the WAF rule per `docs/internal/operations/cloudflare-waf.md`.

- Updated dependencies [fd6e829]
  - @devicesdk/core@1.2.1

## 0.3.0

### Minor Changes

- e53d79f: Add ESP32-C3 as a supported device type.
  - Firmware: new `sdkconfig.defaults.esp32c3` (WS2812 on GPIO 8); `Kconfig.projbuild` defaults addressable LED on for the C3 target; `hal.c` branches on `SOC_RMT_SUPPORTED` and uses the RMT backend for led_strip on C3 (C61 keeps the SPI backend).
  - Build & CI: `firmware/esp32/package.json` `build:all` + `publish` now emit and upload `esp32c3-client.bin`. The `firmware-esp32` GitHub workflow is converted to a target matrix (`esp32`, `esp32c61`, `esp32c3`) with per-target R2 uploads on main.
  - API: `POST /v1/projects/:p/devices/:d/firmware` accepts `device_type: "esp32c3"`. The ESP branch now uses `startsWith("esp32")` to route any ESP variant to `<target>-client.bin`.
  - CLI: `DeviceType` gains `"esp32c3"`; `isEsp32DeviceType` simplified to `startsWith("esp32")`; `getEsp32ChipName` returns `"esp32c3"` for the new target, and `devicesdk flash` routes C3 devices to `flashESP32` with `--chip esp32c3`. Tests cover the new device type in `config.test.ts` and `flash.test.ts`.

### Patch Changes

- Updated dependencies [e53d79f]
  - @devicesdk/core@1.2.0

## 0.2.2

### Patch Changes

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
- b84d2cc: - Add usage examples (`.addHelpText("after", ...)`) to every `devicesdk` subcommand - `login`, `logout`, `whoami`, `init`, `dev`, `build`, `deploy`, `logs`, `flash`, `status`, `inspect`, `env set`/`list`/`unset`. Discoverable via `--help`.
  - Import `HaEntityDeclaration` type from `@devicesdk/core` in `config.ts` instead of redeclaring it. The local Zod schema stays in the CLI (core has no runtime deps), but its inferred shape is now type-asserted against the core interface to catch drift.
  - Remove `"dependsOn": ["^build"]` from the `lint` Turbo task - linting does not need built upstream artifacts, so this lets `pnpm lint` run in parallel with (and independently of) `pnpm build`.
- 916fcd1: - Fix `devicesdk dev` crashing on startup with `ReferenceError: DurableObject is not defined`. The simulator's `deviceBridge.ts` had only a type-only `declare class DurableObject` and no runtime import, so workerd couldn't find the class and the user's script never loaded. Now imports `DurableObject` from `cloudflare:workers`.
- Updated dependencies [23b8924]
  - @devicesdk/core@1.1.2

## 0.2.1

### Patch Changes

- 618636f: Add error handling for DO RPC calls, R2 operations, and script validation; fix npm package metadata and README
- 6ba99ed: Security and quality improvements for public launch: 401 session handling, logout error handling, UF2 validation surfacing, redirect URL validation consolidation, security headers, privacy policy, terms of service, CLI version fix, and core README update.

## 0.2.0

### Minor Changes

- c9a38e3: Add cron-style scheduling for device scripts via `crons` property and `onCron()` lifecycle method.

  Device scripts can now declare named cron schedules using standard 5-field cron expressions. The runtime automatically manages DO alarms to fire `onCron(name)` at the scheduled times.

  ```typescript
  class MyDevice extends DeviceEntrypoint {
    crons = {
      heartbeat: "*/5 * * * *", // every 5 minutes
      dailyReport: "0 8 * * *", // every day at 08:00 UTC
    };

    async onCron(name: string) {
      if (name === "heartbeat") {
        const reading = await this.env.DEVICE.i2cRead(0, "0x76", 6);
        console.info("Sensor:", reading);
      }
    }
  }
  ```

- 5d8f9da: Add offset-based pagination to ListProjects, ListDevices, and ListApiTokens endpoints. Response format changes from a flat array to `{ items: [...], page: number, per_page: number, has_more: boolean }`. Both the dashboard and CLI auto-paginate to fetch all pages transparently.
- 8c397df: Add `devicesdk status` command that shows live connection state, script version, and last-seen time for all devices in a project. Queries the Durable Object WebSocket state directly for real-time connection status.
- 9ab6698: Add hardware peripheral support: SPI, UART, watchdog timer, on-die temperature sensor, I2C batch write (ESP32), and PIO WS2812 addressable LEDs (Pico). Includes full-stack implementation across firmware, core types, device sender, API, CLI inspect REPL, and simulator.
- 00991a8: Add Home Assistant integration support across the stack:
  - **Generic watch WebSocket** (`GET /v1/projects/:projectId/devices/:deviceId/watch`) delivers real-time `status`, `log`, and structured `state` events over a single hibernation-friendly connection. Replaces the legacy SSE log stream as the canonical real-time primitive. The dashboard now uses this endpoint.
  - **`emitState(entityId, value)` SDK method** on `DeviceSenderInterface` lets device scripts publish structured telemetry to watchers (custom sensors, I2C readings, derived values).
  - **Auto-emitted state events** for built-in hardware messages: `gpio_state_changed`, `pin_state_update`, and `temperature_result` are broadcast as structured `state` events without requiring `emitState` calls.
  - **`HaEntityDeclaration` types** in `@devicesdk/core` for declaring Home Assistant entities.
  - **`ha.entities` config key** in `devicesdk.ts` - the CLI's `deploy` command uploads these declarations to the new `GET/PUT /entities` endpoints after a successful script push.

- 59cb75a: Add `devicesdk inspect <device-id>` interactive hardware inspection CLI command. Opens a REPL for exploring device hardware (GPIO read/write, ADC, PWM, I2C scan/configure/read/write, input monitoring, reboot) without writing a device script. Backed by a new `POST /v1/projects/:projectId/devices/:deviceId/command` API endpoint.
- 1c28cba: Add project-scoped environment variables for device scripts.

  Device scripts can now access secrets via `this.env.VARS.get("KEY")` without hardcoding them in source code. Variables are managed per-project with CLI commands (`devicesdk env set KEY=VALUE`, `env list`, `env unset KEY`) and stored securely outside of device scripts.

### Patch Changes

- 0006ef0: Add `devicesdk logs <project-id> <device-id>` command for viewing and streaming device logs. Supports `--tail`/`-f` for real-time tailing with cursor-based polling, `--level` for severity filtering, and `--lines` to control the initial batch size.
- 5012c53: Add unit tests for the credentials module covering loadCredentials, saveCredentials, deleteCredentials, getToken (including token refresh and expiry), and requireAuth
- 77935f2: Add unit tests for the deploy command covering single-device upload, batch upload, project auto-creation, dry run, message option, and error handling paths.
- 3998ff1: Add test coverage for esp32c61 device type in config validation and flash command
- 14d569d: Add unit tests for generateDeviceTypes in the build command
- 06fb0a4: Add unit tests for the init command
- 0380536: Add unit tests for the login command
- efcf060: Add unit tests for the getConfigDir utility function
- d13518c: Add unit tests for the whoami and logout commands

## 0.1.0

### Minor Changes

- bdd52f7: Add inter-device communication (RPC): devices within the same project can call public methods on each other via `this.env.DEVICES["slug"].method()` with full TypeScript autocomplete, return types, and graceful offline handling.

  ### `@devicesdk/core`
  - New type `RemoteDevice<T>` - extracts public non-lifecycle methods from a device class
  - New type `GetEnv<ProjectDevices>` - generates the full `Env` type with `DEVICE` and `DEVICES` bindings
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
  // src/devices/sensor.ts - call a method on another device
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
  // src/devices/light.ts - expose methods for other devices to call
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
  // devicesdk.ts - no changes needed, just define your devices
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

- bc3493a: Add device logging pipeline: console.log/info/warn/error/debug in user device scripts are automatically captured, persisted to per-device storage, served via GET /v1/.../logs endpoint, and displayed in dashboard Logs tab.

  Breaking: removed `LoggerInterface` and `LOGGER` from `UserWorkerEnv` in `@devicesdk/core`. Use `console.log`/`console.info`/etc. instead of `this.env.LOGGER.info()` - logging is now handled transparently via console override.

- bfa6d9c: Fix stale config test that expected a file path to be valid for the `entrypoint` field after the class-name regex was added
