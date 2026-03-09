# ROADMAP

Internal planning backlog for the DeviceSDK monorepo. Generated from a full codebase audit of all 12 packages, every TODO/FIXME, CI/CD config, test coverage, and feature completeness gaps.

Last updated: 2026-02-07

---

## Summary Table

| # | Task | Description | Status |
|---|------|-------------|--------|
| 1 | [Rewrite Simulator in Vue.js](#1-rewrite-simulator-in-vuejs) | Delete `apps/simulation/` (Next.js) and rewrite as a Vue 3 app that compiles to a static export for the CLI | [ x ]  |
| 2 | [Finish the `dev` Command](#2-finish-the-dev-command) | Un-stub `packages/cli/src/commands/dev.ts` so `devicesdk dev` launches a local workerd simulator | [ x ]  |
| 3 | [Implement Dashboard Script Templates](#3-implement-dashboard-script-templates) | Replace the 6 placeholder templates in DeviceDetailsPage.vue with real, working code | [ ]    |
| 4 | [Implement I2C Batch Write in Pico Firmware](#4-implement-i2c-batch-write-in-pico-firmware) | Wire up `CMD_I2C_BATCH_WRITE` in the Pico Core 1 worker instead of returning an error | [ ]    |
| 5 | [Fix Durable Object Worker Caching Bug](#5-fix-durable-object-worker-caching-bug) | Remove the LOADER.get() workaround once the upstream EW-9769 bug is fixed | [ ]    |
| 6 | [Bring ESP32 Firmware to Feature Parity](#6-bring-esp32-firmware-to-feature-parity) | ESP32 firmware lacks I2C, display, and sensor driver support present in the Pico firmware | [ x ]  |
| 7 | [Add Device Logging Pipeline](#7-add-device-logging-pipeline) | End-to-end: device-side log transport, API ingestion/storage, dashboard log viewer | [ ]    |
| 8 | [Add Real-Time Dashboard Features](#8-add-real-time-dashboard-features) | Live device status, console output, and pin state monitoring in the dashboard | [ ]    |
| 9 | [Add Dashboard Tests](#9-add-dashboard-tests) | Unit tests (Vitest + Vue Test Utils) and E2E tests (Playwright) for the dashboard | [ ]    |
| 10 | [Add API Test Coverage Reporting](#10-add-api-test-coverage-reporting) | Emit coverage from the 63 integration tests, set thresholds, report in CI | [ ]    |
| 11 | [Unify Linting on Biome](#11-unify-linting-on-biome) | Migrate dashboard and simulation from ESLint to Biome for consistency | [ ]    |
| 12 | [Add Continuous Deployment](#12-add-continuous-deployment) | Automated deploy-on-merge for the API, dashboard, and website | [ ]    |
| 13 | [Add Dependency & Security Scanning](#13-add-dependency--security-scanning) | Dependabot/Renovate for dependency updates; SAST scanning in CI | [ ]    |
| 14 | [Add API Rate Limiting](#14-add-api-rate-limiting) | Protect public endpoints from abuse | [ ]    |
| 15 | [Add Account Deletion Endpoint](#15-add-account-deletion-endpoint) | GDPR-style `DELETE /v1/user/me` that cascades through projects, devices, scripts, sessions | [ ]    |
| 16 | [Expand Public Documentation](#16-expand-public-documentation) | API reference, I2C guide, sensor cookbook, `dev` command docs, architecture overview | [ ]    |
| 17 | [Add Monitoring & Error Tracking](#17-add-monitoring--error-tracking) | APM, structured logging, error tracking, and alerting for production | [ ]    |
| 18 | [Automate npm Publishing & Releases](#18-automate-npm-publishing--releases) | Changesets (or similar) for versioning `@devicesdk/core` and `@devicesdk/cli`, CI publish | [ ]    |
| 19 | [Miscellaneous Cleanup](#19-miscellaneous-cleanup) | Small TODOs, type fixes, and dead code across the repo | [ ]    |
| 20 | [Inter-Device Communication (RPC)](#20-inter-device-communication-rpc) | Type-safe method calls between devices in the same project | [ x ]  |
| 21 | [Inter-Device Events / Pub-Sub](#21-inter-device-events--pub-sub) | Project-level event broadcasting between devices | [ ]    |

---

## Detailed Descriptions

### 1. Rewrite Simulator in Vue.js

**Priority**: High
**Packages affected**: `apps/simulation/`, `packages/cli`

The current simulator is a Next.js 15 (React) app at `apps/simulation/`. The rest of the frontend stack is Vue 3 + Quasar (`apps/dashboard/`). but in this case we are using vanila vuejs and NOT usign quasar. Maintaining two frameworks doubles UI dependency surface and prevents sharing components between the dashboard and the simulator.

**What exists today**:
- `apps/simulation/` — Next.js + Radix UI + shadcn/ui + Tailwind + recharts
- Features: interactive board viewer with GPIO pins, virtual sensor connector, live logging panel, device selector
- Builds to `out/` (static export) which is copied into `packages/cli/dist/simulator/assets/` at CLI build time

**Work required**:
1. Delete `apps/simulation/` entirely.
2. Create a new `apps/simulation/` using Vue 3 (cc).
3. Re-implement all current simulator features:
   - Board viewer with clickable GPIO pins (pin state read/write)
   - Virtual sensor connector (temperature, humidity, etc.)
   - Live logging panel (WebSocket-fed device events)
   - Device selector (switch between board models: Pico W, Pico 2W)
4. Configure static export.
5. Verify the CLI build step still copies the static output correctly into `dist/simulator/assets/`.
6. Update CI lint job — currently runs `ESLint (dashboard + simulation)` via turbo; ensure the new Vue app is covered by Biome or ESLint as appropriate.
7. Update `CLAUDE.md` dependency graph and package descriptions.

**Docs impact**: Document the `devicesdk dev` simulator UI in `docs/cli/dev.md` once the dev command is also finished.

---

### 2. Finish the `dev` Command

**Priority**: High
**Packages affected**: `packages/cli`
**File**: `packages/cli/src/commands/dev.ts:140`

The `dev` command is currently stubbed out:
```ts
const dev = async (options: { config?: string }) => {
    console.log("devicesdk dev: coming soon. Thanks for your patience!");
    return;
    // ... all logic below is unreachable
```

The unreachable code below the `return` already contains a mostly-complete implementation: it reads `devicesdk.ts`, bundles user scripts with esbuild, generates a workerd capnp config, and starts a local workerd process serving the simulator UI.

**Work required**:
1. Remove the early return so the existing logic runs.
2. Fix the hardcoded simulator assets path (`TODO` at line 218) — resolve dynamically relative to the CLI install location.
3. Test the full flow: `devicesdk dev` → workerd starts → simulator UI accessible at `http://localhost:8181` → device script runs in a local Durable Object → GPIO/I2C commands round-trip.
4. Add live-reload / watch mode: re-bundle on file changes, restart workerd.
5. Integrate with the new Vue simulator (task #1) — ensure the static assets path resolves correctly after the rewrite.
6. Add `--port` flag to let users pick a port.
7. Write tests for the dev command (currently the existing dev tests at `packages/cli/tests/dev.*.test.ts` test the stubbed version).

**Docs impact**: Create `docs/cli/dev.md` documenting usage, options, and how the local simulator works.

---

### 3. Implement Dashboard Script Templates

**Priority**: High
**Packages affected**: `apps/dashboard`
**File**: `apps/dashboard/src/pages/DeviceDetailsPage.vue:422-470`

All 6 script templates in the dashboard device details page are stubs:

```ts
const templateCode: Record<string, string> = {
    blink: `// TODO: Basic Blink template ...`,
    temperature: `// TODO: Temperature Monitor template ...`,
    i2c: `// TODO: I2C Sensor Reader template ...`,
    pwm: `// TODO: PWM Motor Control template ...`,
    button: `// TODO: Button LED Toggle template ...`,
    gpio: `// TODO: GPIO Input Monitor template ...`,
};
```

Each template only contains a bare `DeviceEntrypoint` class with an empty `onMessage` handler.

**Work required**:
1. **blink** — Toggle the onboard LED (virtual pin 99) on a timer using `this.device.gpio.write()`.
2. **temperature** — Read from a virtual temperature sensor, log the value, optionally send it via `this.send()`.
3. **i2c** — Initialize an I2C bus, read from a known sensor address (e.g., BMP280 at 0x76), parse the data.
4. **pwm** — Set up a PWM output on a configurable pin, sweep duty cycle.
5. **button** — Monitor a GPIO input pin for state changes, toggle an LED on press.
6. **gpio** — Enable GPIO monitoring on multiple pins, log state changes.

Each template should be self-contained, well-commented, and runnable on real hardware without modification.

**Docs impact**: Reference the templates in the quickstart guide or a new "Script Templates" docs page.

---

### 4. Implement I2C Batch Write in Pico Firmware

**Priority**: Medium
**Packages affected**: `firmware/pico`
**File**: `firmware/pico/src/multicore/core1_worker.cpp:468-471`

```cpp
case CMD_I2C_BATCH_WRITE:
    // TODO: implement batch write
    set_error(&resp, "Batch write not yet implemented");
    break;
```

The SDK declares `i2cBatchWrite` in the core types, and the API/Durable Object will forward the command, but the firmware returns an error.

**Work required**:
1. Implement `handle_i2c_batch_write(cmd, &resp)` in `core1_worker.cpp`.
2. Parse the batch write payload (array of `{address, data}` pairs).
3. Execute sequential `i2c_write_blocking()` calls on the hardware I2C bus.
4. Return success/failure per write in the response.
5. Add a matching test in the API integration tests that exercises the batch-write command path.
6. Test on real hardware with a multi-device I2C bus (e.g., OLED display + sensor on the same bus).

---

### 5. Fix Durable Object Worker Caching Bug

**Priority**: Medium (blocked on upstream fix)
**Packages affected**: `apps/api`
**File**: `apps/api/src/durableObjects/lib/device.ts:143-146`

```ts
// TODO: There is a known bug (EW-9769) when a dynamic worker is created
// in a DO in one request and then used in a different request.
// The workaround is to call LOADER.get() again immediately before use
// instead of reusing the cached worker.
```

Currently, the code calls `LOADER.get()` on every request rather than caching the worker instance. This adds latency to every device command.

**Work required**:
1. Monitor the upstream bug tracker for EW-9769 resolution.
2. Once fixed: cache the worker instance on the Durable Object, re-use across requests.
3. Add a regression test that creates a worker in one request, uses it in a subsequent request, and verifies it still works.

---

### 6. Bring ESP32 Firmware to Feature Parity

**Priority**: Medium
**Packages affected**: `firmware/esp32`

The Pico firmware supports: GPIO (read/write/monitor), PWM, ADC, I2C (read/write), SSD1306 display, onboard LED (virtual pin 99). The ESP32 firmware is less mature.

**Work required**:
1. Audit feature gap between `firmware/pico/src/` and `firmware/esp32/`.
2. Implement missing HAL drivers in ESP32: I2C, PWM, ADC, display.
3. Ensure command IDs and response formats match exactly so the API Durable Object code is board-agnostic.
4. Add CI build job for ESP32 (similar to `firmware-pico.yml`).
5. Test on real ESP32 hardware.

**Docs impact**: Update `docs/resources/hardware.md` and changelog when ESP32 reaches parity.

---

### 7. Add Device Logging Pipeline

**Priority**: Medium
**Packages affected**: `apps/api`, `apps/dashboard`, `firmware/pico`, `firmware/esp32`

There is currently no way for devices to send structured logs to the cloud. Users must rely on serial output for debugging.

**Work required**:
1. **Firmware**: Add a log transport that sends log lines over the existing WebSocket connection as a new command type.
2. **API**: Handle incoming log messages in `BaseDevice`, store in D1 (or a dedicated log store) with timestamps, device ID, and severity.
3. **API endpoint**: `GET /v1/projects/:projectId/devices/:deviceId/logs` — paginated, filterable by severity/time range.
4. **Dashboard**: Build a log viewer component (filterable, searchable, auto-scroll, severity coloring).
5. **SDK**: Expose `this.log.info()`, `this.log.warn()`, `this.log.error()` in the device entrypoint runtime.

**Docs impact**: Document the logging API and dashboard viewer. Add a "Debugging your device" guide.

---

### 8. Add Real-Time Dashboard Features

**Priority**: Medium
**Packages affected**: `apps/dashboard`, `apps/api`

The dashboard shows static device state. Users need real-time feedback when a device is connected.

**Work required**:
1. **Live device status**: WebSocket or SSE connection from dashboard to API showing online/offline state changes.
2. **Live console**: Stream `console.log` output from running device scripts to the dashboard in real time.
3. **Pin state monitor**: Show current GPIO pin states with live updates as the device script toggles them.
4. **Connection indicator**: Dashboard header should show a green/red dot for each device's connection status.

**Docs impact**: Document the real-time features in the dashboard section of the docs.

---

### 9. Add Dashboard Tests

**Priority**: Medium
**Packages affected**: `apps/dashboard`

The dashboard has zero tests.

**Work required**:
1. Set up Vitest + Vue Test Utils for component unit tests.
2. Write unit tests for critical components: login flow, project CRUD, device details, script editor.
3. Set up Playwright for E2E tests.
4. Write E2E tests for: login → create project → create device → deploy script → view device.
5. Add test jobs to `ci.yml`.
6. Set coverage thresholds.

---

### 10. Add API Test Coverage Reporting

**Priority**: Low
**Packages affected**: `apps/api`, `.github/workflows/ci.yml`

The API has 63 integration tests across 6 files, but no coverage reporting.

**Work required**:
1. Enable `@vitest/coverage-istanbul` in `tests/vitest.config.mts`.
2. Configure coverage thresholds (start with current baseline, ratchet up).
3. Add coverage reporting step to CI (upload to Codecov or similar).
4. Add a coverage badge to the repo README.

---

### 11. Unify Linting on Biome

**Priority**: Low
**Packages affected**: `apps/dashboard`, `apps/simulation`

Currently two linting tools:
- **Biome**: `apps/api`, `packages/core`, `packages/cli`
- **ESLint**: `apps/dashboard`, `apps/simulation`

The CI lint job runs both. This adds maintenance overhead and inconsistent style.

**Work required**:
1. Add Biome config for `apps/dashboard` (Vue SFC support may require Biome 2.x or a plugin — verify compatibility).
2. If Biome can't handle Vue SFCs yet, defer this task or use Biome for TS/JS files and keep ESLint only for `.vue` lint rules.
3. After the simulation rewrite (task #1), apply the same approach to the new Vue simulation app.
4. Remove ESLint deps and configs once fully migrated.
5. Simplify the CI lint job to a single Biome invocation.

---

### 12. Add Continuous Deployment

**Priority**: Medium
**Packages affected**: `.github/workflows/`

All deployments are currently manual. There are no CD workflows.

**Work required**:
1. **API**: Add a `deploy-api.yml` workflow — on merge to `main`, run `wrangler deploy` for the API worker. Include migration apply step.
2. **Dashboard**: Add a `deploy-dashboard.yml` — build and deploy the Quasar SPA (to hosting provider).
3. **Website**: Add a `deploy-website.yml` — build Hugo site and deploy.
4. **Firmware**: Auto-upload built UF2 artifacts to R2 on tagged releases so `devicesdk flash` can fetch them.
5. Add environment protection rules (require approval for production deploys).
6. Add rollback documentation or one-click rollback mechanism.

---

### 13. Add Dependency & Security Scanning

**Priority**: Low
**Packages affected**: root, `.github/`

No dependency update automation or security scanning exists.

**Work required**:
1. Enable Dependabot or Renovate for automated dependency PRs.
2. Add a CodeQL or Semgrep workflow for SAST scanning.
3. Add `pnpm audit` step to CI.
4. Configure alerts for critical/high severity vulnerabilities.

---

### 14. Add API Rate Limiting

**Priority**: Medium
**Packages affected**: `apps/api`

No rate limiting on any API endpoint. Public endpoints (OAuth, CLI auth) are especially exposed.

**Work required**:
1. Implement rate limiting middleware in the Hono app (token bucket or sliding window).
2. Use this https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ for rate limit state (per-IP for unauthenticated, per-user for authenticated).
3. Apply stricter limits to auth endpoints, generous limits to authenticated CRUD.
4. Return `429 Too Many Requests` with `Retry-After` header.
5. Add integration tests for rate limit behavior.

---

### 15. Add Account Deletion Endpoint

**Priority**: Medium
**Packages affected**: `apps/api`, `apps/dashboard`

No way for users to delete their account or data.

**Work required**:
1. Add `DELETE /v1/user/me` endpoint.
2. Cascade delete: sessions, API tokens, projects, devices, scripts (R2 objects), firmware (R2 objects).
3. Revoke Google OAuth token.
4. Add confirmation step in the dashboard (type account name to confirm).
5. Add integration test.

---

### 16. Expand Public Documentation

**Priority**: Medium
**Packages affected**: `docs/`, `apps/website`

Current docs: quickstart, first-device guide, 3 CLI command pages (`init`, `deploy`, `flash`), concepts (entrypoints, versioning, architecture), resources (hardware, changelog, FAQ, glossary, troubleshooting).

**Missing docs**:
1. `docs/cli/dev.md` — Document the `devicesdk dev` local simulator command (blocked on tasks #1 and #2).
2. `docs/cli/login.md` — Document `devicesdk login` and `devicesdk logout`.
3. `docs/cli/build.md` — Document `devicesdk build` and the esbuild pipeline.
4. `docs/guides/i2c.md` — Guide for I2C sensor wiring + code.
5. `docs/guides/sensors.md` — Cookbook for common sensors (BMP280, DHT22, MPU6050, etc.).
6. `docs/guides/logging.md` — How to debug devices (blocked on task #7).
7. `docs/api-reference.md` — Auto-generated from the OpenAPI/Chanfana schema, or hand-written endpoint reference.
8. Update `docs/resources/hardware.md` when ESP32 reaches parity.

**Reminder**: All public docs must follow the content guideline in CLAUDE.md — never mention Cloudflare or Cloudflare product names. Use "managed platform", "serverless runtime", "globally distributed runtime" etc.

---

### 17. Add Monitoring & Error Tracking

**Priority**: Low
**Packages affected**: `apps/api`, `apps/dashboard`

No observability infrastructure in place.

**Work required**:
1. Add structured logging to the API (JSON format, correlation IDs).
2. Integrate an error tracking service (Sentry or similar) for both API and dashboard.
3. Add performance metrics (request latency, WebSocket connection counts, Durable Object memory usage).
4. Set up alerting for error rate spikes, latency thresholds, and failed deployments.

---

### 18. Automate npm Publishing & Releases

**Priority**: Low
**Packages affected**: `packages/core`, `packages/cli`

Both packages are at 0.x and are not yet published to npm with any automation.

**Work required**:
1. Adopt a versioning tool (Changesets recommended for monorepos).
2. Add a `release.yml` workflow: on merge to `main`, if changeset files are present, bump versions and publish to npm.
3. Auto-generate changelog entries from changesets.
4. Tag releases in git.
5. Update `docs/resources/changelog.md` automatically or as part of the release process.

---

### 19. Miscellaneous Cleanup

**Priority**: Low
**Packages affected**: various

Small TODOs and type issues scattered across the codebase:

| File | Line | Issue |
|------|------|-------|
| `packages/cli/src/simulator/worker.ts` | 2 | `TODO: add types to env and ctx` — add proper type annotations |
| `packages/cli/src/commands/dev.ts` | 218 | `TODO: make this path dynamic` — resolve simulator assets path from CLI install dir |
| `firmware/pico/src/websocket_handler.cpp` | 209 | `TODO: Add CMD_GPIO_DISABLE_MONITORING if needed` — evaluate if this command is necessary |
| `examples/temperature-to-discord/src/devices/temperatureSensor.ts` | 3 | `TODO: Implement Discord integration` — finish the example or remove it |

---

### 20. Inter-Device Communication (RPC)

**Priority**: High
**Packages affected**: `packages/core`, `packages/cli`, `apps/api`
**Status**: Done

Type-safe inter-device RPC so that `this.env.DEVICES["light-controller"].turnOn()` works with full TypeScript autocomplete and request-response semantics.

**What was implemented**:
1. `RemoteDevice<T>` and `GetEnv<ProjectDevices>` types in `packages/core` — extracts public non-lifecycle methods from device classes
2. CLI generates `devicesdk-env.d.ts` alongside `devicesdk.ts` with project device types
3. `DevicesBridge` WorkerEntrypoint resolves device slugs via D1 and dispatches RPC calls
4. `BaseDevice.handleRemoteCall()` loads user worker and invokes methods
5. `classProxy.ts` creates `DEVICES` JS Proxy and exposes `callMethod` with lifecycle method blocking
6. Max call depth of 3 prevents infinite cycles between devices

**Limitations**: Same project only. RPC args must be JSON-serializable. Full E2E testing requires LOADER + R2 (tested via manual local dev workflow).

---

### 21. Inter-Device Events / Pub-Sub

**Priority**: Medium
**Packages affected**: `packages/core`, `apps/api`
**Status**: Not started

Complements RPC (task #20) for one-to-many communication patterns.

**Proposed design**:
1. `this.env.PROJECT.emit('event-name', data)` for broadcasting events to all devices in a project
2. `onProjectEvent(event, data)` lifecycle method for receiving events
3. Event delivery is best-effort (no guaranteed ordering or exactly-once delivery)

**Work required**:
1. Add `ProjectBridge` WorkerEntrypoint that fans out events to all device DOs in a project
2. Add `onProjectEvent` to `DeviceEntrypoint` lifecycle methods
3. Add event types to `@devicesdk/core`
4. Add integration tests and documentation
