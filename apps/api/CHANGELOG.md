# @devicesdk/api

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
