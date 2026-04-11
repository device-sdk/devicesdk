# @devicesdk/cli

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
  - **`ha.entities` config key** in `devicesdk.ts` — the CLI's `deploy` command uploads these declarations to the new `GET/PUT /entities` endpoints after a successful script push.

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

- bc3493a: Add device logging pipeline: console.log/info/warn/error/debug in user device scripts are automatically captured, persisted to per-device storage, served via GET /v1/.../logs endpoint, and displayed in dashboard Logs tab.

  Breaking: removed `LoggerInterface` and `LOGGER` from `UserWorkerEnv` in `@devicesdk/core`. Use `console.log`/`console.info`/etc. instead of `this.env.LOGGER.info()` — logging is now handled transparently via console override.

- bfa6d9c: Fix stale config test that expected a file path to be valid for the `entrypoint` field after the class-name regex was added
