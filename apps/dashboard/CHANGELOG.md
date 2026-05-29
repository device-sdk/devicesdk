# @devicesdk/dashboard

## 0.1.6

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

## 0.1.5

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

## 0.1.4

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

## 0.1.3

### Patch Changes

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

## 0.1.2

### Patch Changes

- 769f12d: Swap the DeviceSDK logo to the new chip-braces mark (DIP silhouette with `{ }` braces on the die). Three coordinated SVG variants from the brand package are now wired up:
  - **Containerized favicon** (rounded-black square w/ white chip) — serves `apps/website/static/logo.svg` (browser tab, `/api/docs` favicon, OG card source) and `apps/dashboard/public/favicon.svg` (browser tab, in-app header, drawer, login page).
  - **Inverse mark** (white chip, transparent bg) — serves `apps/website/assets/logo.svg`, rendered in the website's dark navbar and footer.
  - **Primary mark** — stored at `.brand/` alongside the full brand spec HTML for future use.

  Also:
  - Inline the OG-card logo SVG directly in `apps/website/generate-og.js` so social-card regeneration no longer fetches `https://devicesdk.com/logo.svg` at build time.
  - Delete 46 stale pre-rendered OG PNGs under `apps/website/static/og-images/` — they regenerate on the next `pnpm build --filter @devicesdk/website` with the new mark.
  - Remove the dead lightning-bolt fallback branch in the website `header.html` / `footer.html` Hugo partials; the logo resource has existed for some time.

## 0.1.1

### Patch Changes

- fe1bad8: Replace stub script templates in the dashboard with working examples covering blink, temperature monitoring, I2C sensor reading, PWM motor control, button LED toggle, and GPIO input monitoring.

## 0.1.0

### Minor Changes

- bc3493a: Add device logging pipeline: console.log/info/warn/error/debug in user device scripts are automatically captured, persisted to per-device storage, served via GET /v1/.../logs endpoint, and displayed in dashboard Logs tab.

  Breaking: removed `LoggerInterface` and `LOGGER` from `UserWorkerEnv` in `@devicesdk/core`. Use `console.log`/`console.info`/etc. instead of `this.env.LOGGER.info()` — logging is now handled transparently via console override.
