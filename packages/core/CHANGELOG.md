# @devicesdk/core

## 1.4.4

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

## 1.4.3

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
    (`device-sdk/devicesdk-monorepo`) instead of the bare org root, and aligned a
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

- 3a72934: Self-host release readiness pass
  - Added `KNOWN_NOT_ISSUES.md` documenting the npm Trusted Publishers release setup.
  - Fixed dashboard token snippet and redirect allow-list for custom self-hosted origins.
  - Added `apps/server/.env.example` and a `TRUST_PROXY` setting so rate limiting safely handles reverse proxies.
  - Removed stale cloud-era wording from `@devicesdk/core`, the CLI `init` template, and `examples/AGENTS.md`.
  - Corrected OTA firmware claims in docs until the feature ships.
  - Updated `TROUBLESHOOT.md` to reference self-hosted dashboard URLs and generic proxy/CDN guidance.
  - Added `data/` directories to `.gitignore`, pinned the Bun version in `Dockerfile` to `1.3.14`, and renamed `durableObjectStub.ts` to `deviceHandle.ts`.
  - Documented the intentionally skipped migration `0003` in `apps/server/migrations/README.md`.

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

## 1.4.2

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

## 1.4.1

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

- 7e66d0f: Infra and quality improvements (no user-visible changes):
  - **API metrics** - emit Analytics Engine data points for command RPC latency, user-script init time, and Worker Loader failures. New `ANALYTICS` binding declared in `apps/api/wrangler.jsonc` (top-level + `env.production`); thin wrapper at `apps/api/src/foundation/analytics.ts` with three event kinds (`command_rpc`, `script_init`, `loader_failure`) using `event_kind` as the index for cross-cutting queries. Safe with the binding undefined (local dev / tests no-op).
  - **`@devicesdk/core` unit tests** - add `vitest` to the package with runtime tests for `I2cDevice` and `SSD1306` (constructor defaults, the `esp32c3OledVariant` factory, pixel ops, drawing primitives, sparse encoding) and type-level guards for the `DeviceCommand` / `DeviceResponse` discriminated unions, including the `payload.mode`-discriminated `PinStateUpdate`. Wired into root `pnpm test` and `turbo run test`.
  - **Pico firmware host tests in CI** - the existing gtest suite under `firmware/pico/test/` (base64, i2c command handlers, display update, ws client) is now built and run in `.github/workflows/firmware-pico.yml`, mirroring the ESP32 pattern. The `build` job depends on `unit-tests` so a regression blocks the firmware build.
  - **Workflow consolidation** - `dashboard-tests.yml` is merged into `ci.yml` as `Component Tests` and `E2E Tests` jobs (gated on PR events, matching prior behavior). Old workflow file removed. Branch protection: required-status-check names change from `Dashboard Tests / *` to `CI / *` - update settings post-merge.
  - **PR preview deploys** - new `.github/workflows/preview-deploys.yml` publishes per-PR preview URLs for the dashboard and website using `wrangler versions upload --tag pr-N`, gated on changed paths. Each preview posts (and updates) a sticky PR comment with the URL. Website's `preview_urls` flag flipped to `true` to enable preview URL emission; production traffic still routes via the custom domain.

## 1.4.0

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

## 1.3.0

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

## 1.2.1

### Patch Changes

- fd6e829: ESP32-C3 0.42″ OLED ergonomics + local-dev fixes:
  - **firmware/esp32**: paint boot status (`Booting` → `WiFi` → `Server`) on the on-board OLED for FN4 / "0.42 OLED" boards. The firmware probes `0x3C` at boot via `i2c_master_probe`; boards without an OLED (DevKitM-1) get a fast NACK and silently skip. Replaces the WS2812-only feedback that was invisible on FN4 boards (no LED wired to GPIO 8).
  - **firmware/esp32**: detect plain-HTTP local API hosts (`<lan-ip>:<port>`) and dial `ws://` instead of `wss://`, so flashing against `localhost:8787` works without a TLS cert.
  - **@devicesdk/api**: throw an explicit error from the `/v1/auth/google` route when `GOOGLE_ID`/`GOOGLE_SECRET` are missing - Sentry captures the misconfiguration cleanly instead of returning a generic chanfana validation error.
  - **@devicesdk/core**: update `columnOffset` comments to point at `28` (most common on FN4 0.42″ boards) and note `30`/`32` variants exist.
  - **@devicesdk/website**: document `columnOffset: 28` for the 0.42″ 72×40 panel and add a troubleshooting note for the leftmost vertical-stripe artifact (panel-offset mismatch / stale RAM).

## 1.2.0

### Minor Changes

- e53d79f: Add `columnOffset` / `pageOffset` options to the SSD1306 driver and the `display_update` wire command, so panels whose glass doesn't start at RAM column/page 0 can render correctly.

  This unblocks the 0.42″ 72×40 SSD1306 OLED used on many ESP32-C3 dev boards (the glass sits at `columnOffset: 30`). Existing 128×64 / 128×32 integrations are unaffected - offsets default to 0 and are only emitted on the wire when non-zero.

  On the firmware side, both the ESP32 and Pico `display_update` handlers now accept the two new optional payload fields and apply them to the controller's column/page address ranges. The dimension validator on the Pico was also relaxed from "128×32 or 128×64 only" to "any width ≤128 and height ≤64 that's a multiple of 8" so narrow panels like 72×40 are no longer rejected at the boundary. The SH1106 code path preserves its implicit `columnOffset: 2` default, keeping existing SH1106 integrations pixel-identical.

## 1.1.2

### Patch Changes

- 23b8924: - Fix `devicesdk init` template: declare `@devicesdk/core` as a runtime dep of the CLI so resolved versions reflect the installed package (was hardcoded `^0.0.1`); install with the package manager that invoked the CLI (pnpm, yarn, npm, or bun) via `npm_config_user_agent` detection.
  - Expose `./package.json` in `@devicesdk/core` package exports so version lookups via `createRequire` / `require.resolve` work under Node's `exports`-enforced resolution.
  - Return a 500 JSON error when UF2 firmware validation fails after patching, instead of a 200 response with an `X-Firmware-Validation: failed` header that most clients would ignore.
  - Add a safety comment in the device Durable Object explaining the in-memory `logWatchers` cleanup behavior across hibernation.

## 1.1.1

### Patch Changes

- 618636f: Add error handling for DO RPC calls, R2 operations, and script validation; fix npm package metadata and README
- 6ba99ed: Security and quality improvements for public launch: 401 session handling, logout error handling, UF2 validation surfacing, redirect URL validation consolidation, security headers, privacy policy, terms of service, CLI version fix, and core README update.

## 1.1.0

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

- 9ab6698: Add hardware peripheral support: SPI, UART, watchdog timer, on-die temperature sensor, I2C batch write (ESP32), and PIO WS2812 addressable LEDs (Pico). Includes full-stack implementation across firmware, core types, device sender, API, CLI inspect REPL, and simulator.
- 00991a8: Add Home Assistant integration support across the stack:
  - **Generic watch WebSocket** (`GET /v1/projects/:projectId/devices/:deviceId/watch`) delivers real-time `status`, `log`, and structured `state` events over a single hibernation-friendly connection. Replaces the legacy SSE log stream as the canonical real-time primitive. The dashboard now uses this endpoint.
  - **`emitState(entityId, value)` SDK method** on `DeviceSenderInterface` lets device scripts publish structured telemetry to watchers (custom sensors, I2C readings, derived values).
  - **Auto-emitted state events** for built-in hardware messages: `gpio_state_changed`, `pin_state_update`, and `temperature_result` are broadcast as structured `state` events without requiring `emitState` calls.
  - **`HaEntityDeclaration` types** in `@devicesdk/core` for declaring Home Assistant entities.
  - **`ha.entities` config key** in `devicesdk.ts` - the CLI's `deploy` command uploads these declarations to the new `GET/PUT /entities` endpoints after a successful script push.

- 1c28cba: Add project-scoped environment variables for device scripts.

  Device scripts can now access secrets via `this.env.VARS.get("KEY")` without hardcoding them in source code. Variables are managed per-project with CLI commands (`devicesdk env set KEY=VALUE`, `env list`, `env unset KEY`) and stored securely outside of device scripts.

## 1.0.0

### Major Changes

- bc3493a: Add device logging pipeline: console.log/info/warn/error/debug in user device scripts are automatically captured, persisted to per-device storage, served via GET /v1/.../logs endpoint, and displayed in dashboard Logs tab.

  Breaking: removed `LoggerInterface` and `LOGGER` from `UserWorkerEnv` in `@devicesdk/core`. Use `console.log`/`console.info`/etc. instead of `this.env.LOGGER.info()` - logging is now handled transparently via console override.

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
