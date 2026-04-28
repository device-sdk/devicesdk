# ROADMAP

Internal planning backlog for the DeviceSDK monorepo. Generated from a full codebase audit of all 12 packages, every TODO/FIXME, CI/CD config, test coverage, and feature completeness gaps.

Last updated: 2026-04-24

---

## Summary Table

| # | Task | Description | Status |
|---|------|-------------|--------|
| 1 | [Rewrite Simulator in Vue.js](#1-rewrite-simulator-in-vuejs) | Delete `apps/simulation/` (Next.js) and rewrite as a Vue 3 app that compiles to a static export for the CLI | [ x ]  |
| 2 | [Finish the `dev` Command](#2-finish-the-dev-command) | Un-stub `packages/cli/src/commands/dev.ts` so `devicesdk dev` launches a local workerd simulator | [ x ]  |
| 3 | [Implement Dashboard Script Templates](#3-implement-dashboard-script-templates) | Replace the 6 placeholder templates in DeviceDetailsPage.vue with real, working code | [ x ]  |
| 4 | [Implement I2C Batch Write in Pico Firmware](#4-implement-i2c-batch-write-in-pico-firmware) | Wire up `CMD_I2C_BATCH_WRITE` in the Pico Core 1 worker instead of returning an error | [ ]    |
| 5 | [Fix Durable Object Worker Caching Bug](#5-fix-durable-object-worker-caching-bug) | Remove the LOADER.get() workaround once the upstream EW-9769 bug is fixed | [ ]    |
| 6 | [Bring ESP32 Firmware to Feature Parity](#6-bring-esp32-firmware-to-feature-parity) | ESP32 firmware lacks I2C, display, and sensor driver support present in the Pico firmware | [ x ]  |
| 7 | [Add Device Logging Pipeline](#7-add-device-logging-pipeline) | End-to-end: device-side log transport, API ingestion/storage, dashboard log viewer | [ x ]  |
| 8 | [Add Real-Time Dashboard Features](#8-add-real-time-dashboard-features) | Live device status, console output, and pin state monitoring in the dashboard | [ x ]  |
| 9 | [Add Dashboard Tests](#9-add-dashboard-tests) | Unit tests (Vitest + Vue Test Utils) and E2E tests (Playwright) for the dashboard | [ x ]  |
| 10 | [Add API Test Coverage Reporting](#10-add-api-test-coverage-reporting) | Emit coverage from the 63 integration tests, set thresholds, report in CI | [ x ]  |
| 11 | [Unify Linting on Biome](#11-unify-linting-on-biome) | Migrate dashboard and simulation from ESLint to Biome for consistency | [ ]    |
| 12 | [Add Continuous Deployment](#12-add-continuous-deployment) | Automated deploy-on-merge for the API, dashboard, and website | [ x ]  |
| 13 | [Add Dependency & Security Scanning](#13-add-dependency--security-scanning) | Dependabot/Renovate for dependency updates; SAST scanning in CI | [ ]    |
| 14 | [Add API Rate Limiting](#14-add-api-rate-limiting) | Protect public endpoints from abuse | [ x ]  |
| 15 | [Add Account Deletion Endpoint](#15-add-account-deletion-endpoint) | GDPR-style `DELETE /v1/user/me` that cascades through projects, devices, scripts, sessions | [ x ]  |
| 16 | [Expand Public Documentation](#16-expand-public-documentation) | API reference, I2C guide, sensor cookbook, `dev` command docs, architecture overview | [ ]    |
| 17 | [Add Monitoring & Error Tracking](#17-add-monitoring--error-tracking) | APM, structured logging, error tracking, and alerting for production | [ x ]  |
| 18 | [Automate npm Publishing & Releases](#18-automate-npm-publishing--releases) | Changesets (or similar) for versioning `@devicesdk/core` and `@devicesdk/cli`, CI publish | [ x ]  |
| 19 | [Miscellaneous Cleanup](#19-miscellaneous-cleanup) | Small TODOs, type fixes, and dead code across the repo | [ ]    |
| 20 | [Inter-Device Communication (RPC)](#20-inter-device-communication-rpc) | Type-safe method calls between devices in the same project | [ x ]  |
| 21 | [Inter-Device Events / Pub-Sub](#21-inter-device-events--pub-sub) | Project-level event broadcasting between devices | [ ]    |
| 22 | [Firmware TLS Certificate Verification (Pico)](#22-firmware-tls-certificate-verification-pico) | Embed CA cert or pin server public key so Pico TLS verifies the server identity | [ x ]  |
| 23 | [Capture Console Logs in Simulator](#23-capture-console-logs-in-simulator) | Pipe user-script `console.log/info/warn/error` through to the simulator UI log drawer — today they only hit terminal stdout | [ ]    |
| 24 | [Restore OLED Display Rendering as Widget](#24-restore-oled-display-rendering-as-widget) | Regression from the ESP32 redesign: `display_update` commands are logged but no pixels are drawn | [ ]    |
| 25 | [Source Code Viewer in the Simulator](#25-source-code-viewer-in-the-simulator) | Collapsible drawer showing the running device script so users can debug `onMessage` flow without leaving the simulator | [ ]    |
| 26 | [Device Reboot Button](#26-device-reboot-button) | UI trigger to restart the device (re-run `onDeviceConnect`) without editing a file to trigger chokidar | [ ]    |
| 27 | [WS2812 LED Strip Visualization](#27-ws2812-led-strip-visualization) | Render a horizontal strip of colored LEDs when firmware calls `pioWs2812Configure` / `pioWs2812Update` | [ ]    |
| 28 | [Off-Board Pin Activity Indicator](#28-off-board-pin-activity-indicator) | Visual cue on the board when a pin the script uses isn't exposed on the current board visual | [ ]    |
| 29 | [Custom Domain for AI Search Instance](#29-custom-domain-for-ai-search-instance) | Replace the third-party hosted URL in `ai-search.html` and `mcp/server-card.json` with a `search.devicesdk.com` CNAME (blocked on upstream support) | [ ]    |
| 30 | [Dynamic Worker ServiceStub Serialization Blocker](#30-dynamic-worker-servicestub-serialization-blocker) | ~~User-script `env.DEVICE.sendCommand()` throws `DataCloneError: ServiceStub serialization requires the 'experimental' compat flag` under Worker Loader.~~ **Resolved** — root cause was `.bind()` on an RPC stub method in `classProxy.ts`, which the runtime interpreted as a remote method call. Fix: drop the `.bind(target)` and return the stub method reference directly. | [x]    |

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

---

### 22. Firmware TLS Certificate Verification (Pico)

**Priority**: High (security — partial fix from PR #48, finding C2)
**Packages affected**: `firmware/pico`

**Current state**: The Pico firmware now connects over TLS (`wss://`) but calls
`altcp_tls_create_config_client(NULL, 0)` — a NULL CA bundle means no server
certificate is verified, so a machine-in-the-middle attack is still possible.
The ESP32 firmware is not affected; it uses the Espressif CA bundle correctly.

**Why deferred**: mbedTLS (used by the Pico W lwIP/altcp stack) requires the
CA certificate to be compiled into the firmware image. The build does not yet
embed any root CA.

**Work required**:
1. Obtain the root CA PEM for `api.devicesdk.com` (or its issuing CA).
2. Convert PEM → DER byte array; add as `firmware/pico/src/ca_cert.h`.
3. Pass the DER buffer and length to `altcp_tls_create_config_client()` instead of `NULL, 0`.
4. Verify TLS handshake succeeds against the real server and fails against a self-signed cert (simulated MITM).
5. Update the Pico firmware CI build to fail if the CA buffer is empty.

---

### 23. Capture Console Logs in Simulator

**Priority**: High
**Packages affected**: `apps/simulation`, `packages/cli`
**Files**: `packages/cli/src/simulator/localDeviceSender.ts` (`persistLog` is a no-op), `apps/simulation/src/composables/useSimulator.ts`, `apps/simulation/src/components/layout/LogDrawer.vue`

Today when a user's script calls `console.info("Ready!")` the output only hits the workerd terminal stdout — nothing appears in the simulator UI. The `persistLog` method in `LocalDeviceSender` is stubbed with a `// No-op in local simulator` comment. Debugging is essentially blind from the browser.

**Work required**:
1. Decide on transport: simplest is to have `persistLog` fire a `log_entry` message over the existing WebSocket (sender→UI direction). This requires extending the `DeviceResponse` discriminated union in `@devicesdk/core` (or using a simulator-local side-channel command).
2. Route the frame through the Vue app's `handleDeviceCommand` (or a new watcher that reads inbound non-response messages).
3. Render in the log drawer with a new badge kind (`log`) and level-based coloring (debug grey / info blue / log green / warn amber / error red), matching the dashboard's existing `DeviceLogs.vue` styling for consistency.
4. Patch `packages/core/src/index.ts` `DeviceEntrypoint.console` so calls both hit native `console.*` AND `this.env.DEVICE.persistLog(level, msg)` (may already do this — verify).
5. Add a filter chip in the log drawer to show "commands only" vs "script logs only" vs "both".

**Docs impact**: Document the log drawer in the new `docs/cli/dev.md` (blocked on task #16).

---

### 24. Restore OLED Display Rendering as Widget

**Priority**: High
**Packages affected**: `apps/simulation`

Regression from the ESP32 redesign (PR that added this roadmap item): `apps/simulation/src/components/OledDisplay.vue` was deleted without being migrated into the new widget framework. Scripts that call `i2cWrite` + `display_update` to drive an SSD1306 now log the command but paint zero pixels.

**Work required**:
1. Create `apps/simulation/src/components/widgets/probes/OledDisplayWidget.vue` based on the deleted component (Canvas 2D renderer using the `SSD1306` class from `@devicesdk/core/i2c`).
2. Auto-mount the widget the first time a `display_update` command arrives (no palette drag needed) — store the latest `DisplayUpdateCommand` in a Pinia slice and have the widget watch it.
3. Register as a palette entry (`SSD1306 OLED`) so users can also pre-place it onto I2C pins 21/22 (matches the existing `VirtualSensorConnector` flow pre-redesign).
4. Add E2E test: send a `display_update` from a fixture firmware, assert the canvas renders non-zero pixels.

---

### 25. Source Code Viewer in the Simulator

**Priority**: Medium
**Packages affected**: `apps/simulation`, `packages/cli`

Users debugging a failing script cannot see what code is actually running — they have to context-switch to their editor to cross-reference the simulator's command log with their source. A collapsible drawer showing the user's compiled entrypoint (or the raw `.ts`) would close this loop.

**Work required**:
1. Expose the user's script source from the CLI side — either inline it into the `simulator.js` worker bundle as a text-loader import, or serve it via a new `/api/script/:deviceId` endpoint on the simulator worker.
2. Build `apps/simulation/src/components/layout/ScriptDrawer.vue` — a collapsible panel alongside the log drawer, rendered with syntax highlighting (e.g. `shiki` or `highlight.js` — keep bundle cost in mind).
3. Show the file path and a "Open in editor" link using `vscode://file/…` URLs (and `cursor://…` for Cursor users).
4. Optional: highlight the last line the simulator observed executing by capturing stack frames on each outbound command (non-trivial — defer unless needed).

---

### 26. Device Reboot Button

**Priority**: Medium
**Packages affected**: `apps/simulation`, `packages/cli`

The only way to re-run `onDeviceConnect` today is to edit a source file and let chokidar trigger a rebuild. Users routinely want to test "what happens on fresh boot" without editing anything.

**Work required**:
1. Add a `⟳` reboot button to `SimHeader.vue`. On click, send a synthetic `reboot` command to the simulator's command router.
2. In `apps/simulation/src/composables/useSimulator.ts` `reboot` handler, also close the current WebSocket so the DO's `webSocketClose` fires → `onDeviceDisconnect` → cleanup, then reconnect so `onDeviceConnect` runs fresh.
3. Clear `pinState`, `widgets`, and log state on reboot (the `reset` flow already exists in the store — wire it up to the reboot action).
4. Preserve widget placements across reboots (users don't want to re-drag a BME280 every time). Persist placements to `localStorage` keyed by device id.

---

### 27. WS2812 LED Strip Visualization

**Priority**: Medium
**Packages affected**: `apps/simulation`

`pioWs2812Configure` and `pioWs2812Update` commands currently log text like `WS2812 update: 8 pixels` but never show colors. This is low-effort, high-delight polish — particularly relevant now that the ESP32-C61 and Pico both support addressable strips as a first-class peripheral.

**Work required**:
1. On `pio_ws2812_configure`, create a "LED Strip" widget auto-placed near the top of the stage (no drag needed) bound to the configured GPIO and strip length.
2. On `pio_ws2812_update`, render each pixel as a colored `<circle>` or `<rect>` in SVG. Accept `[r, g, b]` tuples; convert to `rgb(r,g,b)`.
3. Show the pin binding and strip length as widget metadata.
4. Provide a "color sampler" probe for the strip (Phase 4 manual probe) — click a pixel to see its RGB value.

---

### 28. Off-Board Pin Activity Indicator

**Priority**: Low
**Packages affected**: `apps/simulation`

When a user's script drives a pin not exposed on the current board visual (e.g. GPIO 99 on an ESP32 DevKit-C), the Script Pins panel reflects the state but the main board surface shows no activity. A small banner or status row above the board reading "3 off-board pins active · GPIO 99, GPIO 20, GPIO 40" would make the disconnect obvious at a glance.

**Work required**:
1. Compute `offBoardPinsInUse` from the `pinState` store filtered by pins not in `board.pins`.
2. Render a one-line chip row above the `Esp32Board` SVG with clickable chips that scroll the Script Pins panel into view and highlight the selected row.
3. Pulse the chip when a state change happens on that pin (brief flash animation).

---

### 29. Custom Domain for AI Search Instance

**Priority**: Medium (public-facing content guideline)
**Packages affected**: `apps/website`
**Files**: `apps/website/layouts/partials/ai-search.html`, `apps/website/static/.well-known/mcp/server-card.json`

The hosted AI Search instance URL (`https://b055c14c-…search.ai.cloudflare.com`) is shipped in the website's `<head>` on every page and in the public MCP server card. This violates the project's public-facing content guideline (no Cloudflare references under `layouts/` or `content/`). The hosted AI Search service does not currently support custom-domain CNAMEs, so we cannot front it with `search.devicesdk.com` today.

**Work required**:
1. Track upstream support for custom domains on the hosted AI Search product.
2. Once available, create `search.devicesdk.com` CNAME and verify the MCP endpoint + search snippet assets work through it.
3. Replace the hard-coded `$instance` in `apps/website/layouts/partials/ai-search.html` with the custom domain.
4. Update `apps/website/static/.well-known/mcp/server-card.json` `transport.url`.
5. Recompute the `integrity` hash for the search-snippet asset if the custom domain serves it directly.

---

### 30. Dynamic Worker ServiceStub Serialization Blocker

**Status**: ✅ Resolved 2026-04-28.
**Resolution**: One-line fix in `classProxy.ts`. The `safeDevice` Proxy was returning `target[prop].bind(target)` — but `publicEnv.DEVICE` is an RPC stub, not a JS object, so the runtime treated `.bind` as a remote method named `"bind"` and tried to ServiceStub-serialize the stub argument. Returning `target[prop]` directly (without `.bind`) fixes it. Confirmed by Cloudflare runtime team and verified end-to-end against the production minimum repro at `https://servicestub-repro.huckye.workers.dev/`.

**Original priority**: Critical — user scripts were non-functional in production.
**Packages affected**: `apps/api`
**Files**: `apps/api/src/durableObjects/lib/classProxy.ts:54`

#### Symptom

With the user script deployed, the device connects, `webSocketMessage` receives `{"type":"device_connected"}`, the alarm drain (see PR #85) correctly invokes `onDeviceConnect()` inside the dynamically loaded user worker, but the first line that calls `await this.env.DEVICE.sendCommand(...)` throws in the child worker:

```
DataCloneError: ServiceStub serialization requires the 'experimental' compat flag.
```

Captured on real hardware at `/v1/projects/door-sensor/devices/door/logs` from an instrumented DoorSensor script on 2026-04-24. No command ever reaches the firmware's WebSocket.

#### Why this happens

The Worker Loader–child worker receives `env.DEVICE` as a **WorkerEntrypoint stub** created inside the parent DO with `(this.ctx as any).exports.DeviceSender({ props: { deviceId, projectId } })` (device.ts:317). When the child calls any method on that stub (`.sendCommand`, `.getPinState`, `.configureGpioInputMonitoring`, etc.), Workers' RPC runtime has to serialize the stub descriptor across the child↔parent isolate boundary. That path currently requires the **`experimental`** compatibility flag.

Attempting the obvious workaround of setting `compatibilityFlags: ["experimental"]` on the dynamic-worker config fails at deploy time:

```
Error: The compatibility flag experimental is experimental
and cannot yet be used in Workers deployed to Cloudflare.
```

i.e. the flag is itself flagged as experimental and is rejected by the Workers control plane on production deploys. The parent API worker (`apps/api/wrangler.jsonc`) only ships `nodejs_compat` and `nodejs_compat_populate_process_env` for the same reason.

Net effect: **no user script has ever successfully driven hardware in production.** Until this session the bug was masked by (a) the Hibernation-API `webSocketMessage` handler deadlocking any `LOADER.get().getTarget()` call, and (b) an R2-key mismatch that prevented `getOrCreateUserWorker` from finding scripts at all. Both of those were fixed in PR #85; fixing them exposed this underlying issue.

#### What has already been tried and ruled out

1. **Add `compatibilityFlags: ["experimental"]` to the Worker Loader config.** Blocked — control-plane rejects on deploy.
2. **Pass a plain object of functions instead of a stub.** Functions themselves are not structured-cloneable; same DataCloneError class.
3. **Call DO methods directly from user code (`env.DEVICE.get(name).sendCommand(...)`).** Would bypass DeviceSender entirely, but requires exposing the full DO namespace binding to the child, which has its own serialization constraints and also leaks internal methods (`kvPut`, `kvGet`, etc. that `classProxy.ts` currently allowlists against).

#### Options (in order of effort)

1. **Wait for `experimental` to graduate.** Cloudflare's stated path for ServiceStub serialization. Zero code change. Unknown timeline; track releases at <https://developers.cloudflare.com/workers/platform/compatibility-flags/>.
2. **Proxy via HTTP fetch instead of RPC.** Replace `env.DEVICE.sendCommand(cmd)` with `env.DEVICE.fetch("/sendCommand", {method:"POST", body: JSON.stringify(cmd)})` — `Fetcher` bindings don't go through the ServiceStub path. Requires: (a) rewriting `DeviceSender` as a `fetch()` handler that dispatches by URL; (b) updating the `classProxy.ts` `safeDevice` proxy to call `fetch` under the hood but keep the method-call surface user-facing; (c) serialization for complex return types like `getPinState` (wrap in `{status, body}` JSON). Medium effort, touches all 20+ ALLOWED_DEVICE_METHODS.
3. **Move user-facing helpers into the parent DO and expose via a flat RPC method.** Add a single `dispatchUserAction(method, args)` method on `BaseDevice` that switches on the method name internally and calls the real DO logic. Child code calls `env.DEVICE.dispatchUserAction("sendCommand", [cmd])`. This makes the stub signature flat enough that its serialization footprint stays inside what's already supported. Low-medium effort, single pass, but loses per-method type safety.
4. **Ship the user script into the same worker as the API (not dynamic).** Removes the Worker Loader boundary entirely, but kills multi-tenant isolation — a security regression, not acceptable.

Recommended next action: **option 3**. It's the smallest diff that keeps the existing user API shape and avoids needing upstream Cloudflare changes. Option 2 is the "cleaner" long-term shape but touches every `DeviceSender` method.

#### Reproduction

After PR #85 is merged and deployed:

1. Deploy any user script with `await env.DEVICE.sendCommand(...)` inside `onDeviceConnect`:
   ```ts
   export class Foo extends DeviceEntrypoint {
     async onDeviceConnect() {
       await this.env.DEVICE.sendCommand({
         type: "set_gpio_state",
         payload: { pin: 8, state: "high" }
       });
     }
   }
   ```
2. Connect a real device (or force a WS reconnect).
3. `GET /v1/projects/:p/devices/:d/logs` will show:
   ```
   DataCloneError: ServiceStub serialization requires the 'experimental' compat flag.
     at async Foo.onDeviceConnect (device.js:...)
   ```

#### Why the whole session spent chasing this

The bug presents differently depending on which of its pre-conditions is currently in the way:
- Before PR #85's R2-key fix → `Script not found in R2`
- Before PR #85's alarm dispatch → `webSocketMessage` handler hangs, no logs anywhere
- Before PR #85's `async callMethod` → `SyntaxError: Unexpected reserved word` the first time V8 lazy-parses the proxy's return object
- Before stable `workerId` → `Too many concurrent dynamic workers` from alarm-loop worker churn
- Only after all of the above are cleared → the real `DataCloneError` surfaces in persisted `/logs`

Each prior condition hid the next, and none of the intermediate errors were visible in `wrangler tail` (Hibernation-API webSocket events don't render in the tail stream the same way RPC invocations do). The only way to see the final error was the user-side `persistLog` → D1 → `/v1/projects/:p/devices/:d/logs` path.

Keep this fix high on the backlog — everything downstream (dashboard live status, HA integration, script templates, cron schedules firing against real hardware) assumes user scripts can actually drive devices.
