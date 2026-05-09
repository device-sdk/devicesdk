# @devicesdk/core — agent guide

Version-matched API reference for AI coding agents. Read this before generating
DeviceSDK code — your training data may be stale.

## What this package is

`@devicesdk/core` is the public TypeScript surface for DeviceSDK device
scripts. It contains **type definitions only** — no runtime. The runtime is
provided by the DeviceSDK platform when your script is deployed.

A device script extends `DeviceEntrypoint` and runs in a **sandboxed
serverless runtime**, *not* on the microcontroller and *not* in Node.js.

## Public exports (canonical names)

```typescript
import {
  DeviceEntrypoint,        // base class for device scripts
  type DeviceCommand,      // discriminated union of commands sent to firmware
  type DeviceResponse,     // discriminated union of events received from firmware
  type DeviceSenderInterface, // shape of `this.env.DEVICE`
  type KVInterface,        // shape of `this.env.DEVICE.kv`
  type EnvVarsInterface,   // shape of `this.env.VARS`
  type UserWorkerEnv,      // shape of `this.env`
  type HaEntityDeclaration, // declarable HA entities in `devicesdk.ts`
  ENV_VAR_KEY_REGEX,       // env var key validator
} from "@devicesdk/core";

// Subpath imports
import { Pico, type PicoDeviceApi } from "@devicesdk/core/devices/pico";
import { BME280, SSD1306 } from "@devicesdk/core/i2c";
```

The full list — including every command/response variant — is in
`./dist/index.d.ts`. Read it before inventing names.

## Hello world

```typescript
import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";

export class MyDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    console.log("device connected");
    await this.env.DEVICE.setGpioState(99, "high"); // onboard LED
  }

  async onMessage(message: DeviceResponse) {
    if (message.type === "pin_state_update") {
      console.log(`pin ${message.payload.pin} = ${message.payload.value}`);
    }
  }
}
```

The matching `devicesdk.ts`:

```typescript
import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "my-project",
  devices: {
    main: {
      className: "MyDevice",                  // matches the exported class
      main: "./src/devices/myDevice.ts",      // file path, not class name
      deviceType: "pico-w",                   // pico-w | pico2-w | esp32 | esp32c3 | esp32c61
      wifi: { ssid: "...", password: "..." },
    },
  },
});
```

## What you can call on `this`

- `this.env.DEVICE.*` — hardware control. See JSDoc on
  {@link DeviceSenderInterface}. Methods include:
  - `setGpioState(pin, "high"|"low")`, `setPwmState(pin, hz, duty 0..1)`
  - `getPinState(pin, "digital"|"analog")`
  - `i2cConfigure / i2cScan / i2cRead / i2cWrite / i2cBatchWrite`
  - `spiConfigure / spiTransfer / spiWrite / spiRead`
  - `uartConfigure / uartWrite / uartRead`
  - `getTemperature()` (onboard sensor)
  - `pioWs2812Configure / pioWs2812Update` (Pico)
  - `watchdogConfigure / watchdogFeed`
  - `configureGpioInputMonitoring(pin, enable, "up"|"down"|"none")`
  - `emitState(entityId, value)` — push real-time state to dashboard / HA
  - `reboot()`
  - `kv.get<T>(key) / kv.put(key, value) / kv.delete(key)`
  - `persistLog(level, message)`
- `this.env.VARS.get(key)` / `getAll()` — project-scoped secrets.
- `this.env.DEVICES["other-slug"].method(...)` — typed RPC to other devices in
  the same project. The CLI generates types from `devicesdk.ts` on each build.
- Lifecycle hooks (override on your subclass): `onDeviceConnect()`,
  `onDeviceDisconnect()`, `onMessage(message)`, `onCron(name)`.

## Pin numbering — read this before writing GPIO code

- **Virtual pin 99 = onboard LED** on every supported board. Use it instead of
  hardcoding chip-specific GPIOs.
- Pico W: GPIOs 0–22, 26–28; ADC on 26, 27, 28.
- ESP32-C3 DevKitM-1: onboard LED is WS2812 on GPIO 8 (use pin 99 for
  portability).
- ESP32-C61 DevKitC-1: onboard LED is WS2812 on GPIO 5 (use pin 99).

## Common mistakes

- ❌ `onMessage(message: any)` → ✅ `onMessage(message: DeviceResponse)` and
  narrow on `message.type`.
- ❌ `setPwmState(pin, 1000, 50)` (50% duty) → ✅ `setPwmState(pin, 1000, 0.5)`
  — `dutyCycle` is **0..1**, not a percent.
- ❌ `import fs from "node:fs"` — the runtime is not Node. Use `fetch`,
  `this.env.DEVICE.kv`, or `this.env.VARS`.
- ❌ `entrypoint: "MyDevice"` in `devicesdk.ts` → ✅ `className: "MyDevice"`.
  The field was renamed.
- ❌ Returning a value from `onMessage` — its return type is
  `void | Promise<void>`. To respond to the device, call `this.env.DEVICE.*`.
- ❌ Long `for` / `while` loops in a hook — the runtime budgets CPU per event.
  Use `crons = { ... }` for periodic work.
- ❌ Hardcoding I2C bytes as `["0xAEDA"]` (one element with two bytes) → ✅
  `["0xAE", "0xDA"]` (one element per byte).
- ❌ `import { GetEnv }` — deprecated; use `UserWorkerEnv`.

## Event-driven flow

The runtime is event-driven. There is no `main()` or polling loop. The
runtime invokes one of your hooks per event and **then your script unloads**.
State that needs to survive between events lives in `this.env.DEVICE.kv` or
`this.env.VARS`. Counters, timers, or "last seen" values must be persisted.

For periodic work, declare `crons = { name: "<5-field cron in UTC>" }` and
implement `onCron(name)`.

## Where to find more

- Cookbook recipes: <https://devicesdk.com/docs/recipes/>
- Concept docs: <https://devicesdk.com/docs/concepts/>
- CLI reference: <https://devicesdk.com/docs/cli/>
- Hardware specifics: <https://devicesdk.com/docs/hardware/>
- This file lives at `node_modules/@devicesdk/core/AGENTS.md` — version-matched
  to whatever you installed. Check the version on
  `node_modules/@devicesdk/core/package.json` if behavior surprises you.
