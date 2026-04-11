# @devicesdk/api

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
