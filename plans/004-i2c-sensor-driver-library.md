# Plan 004: Ship a typed I2C sensor driver library in @devicesdk/core

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 321ef7e..HEAD -- packages/core docs/public/recipes/read-bme280.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (pure TypeScript, no firmware or server changes, additive API)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `321ef7e`, 2026-07-05

## Why this matters

DeviceSDK today exposes raw I2C primitives (`i2cRead`/`i2cWrite`) and exactly
one high-level driver (the SSD1306 OLED). Reading any real sensor means
hand-rolling register reads: the official `read-bme280` recipe stops at the
chip-ID check because the full BME280 requires ~60 lines of Bosch compensation
math that users would have to copy-paste. A typed driver library turns "wire a
BME280 and get temperature/humidity/pressure" into three lines of TypeScript,
works on every supported board with **zero firmware changes** (everything rides
the existing `i2c_read`/`i2c_write` commands), and directly feeds the Home
Assistant integration path (`emitState` + `HaEntityDeclaration`, see
`packages/core/src/ha.ts`): every driver added multiplies what users can expose
to HA.

This plan adds the read-capable driver pattern plus five drivers: **BME280/BMP280**
(temp/humidity/pressure), **SHT3x** (temp/humidity), **BH1750** (lux),
**ADS1115** (4-channel 16-bit ADC), **INA219** (voltage/current/power).

## Current state

- `packages/core/src/i2c/I2cDevice.ts` - the only driver base class. It is
  **write-only**: it batches writes into an `i2c_batch_write` command and has no
  way to read. Excerpt (lines 12-28):

  ```ts
  export class I2cDevice {
      protected bus: number;
      protected address: string;
      protected pendingWrites: string[][] = [];

      constructor(options: I2cDeviceOptions) {
          this.bus = options.bus ?? 0;
          this.address = options.address;
      }

      protected queueWrite(data: string[]): this {
          this.pendingWrites.push(data);
          return this;
      }
  ```

- `packages/core/src/runtime.ts` - `DeviceSenderInterface`, the hardware surface
  scripts get as `this.env.DEVICE`. The methods drivers need (lines 168 and
  181-186):

  ```ts
  i2cWrite(bus: number, address: string, data: string[]): Promise<void>;
  i2cRead(
      bus: number,
      address: string,
      bytesToRead: number,
      registerToRead?: string,
  ): Promise<DeviceResponse>;
  ```

  `i2cRead` resolves with a `DeviceResponse` union member; the success case is
  `I2cReadResult` from `packages/core/src/responses.ts` (lines 39-46):

  ```ts
  export interface I2cReadResult extends BaseResponse {
      type: "i2c_read_result";
      payload: {
          bus: number;
          address: string;
          data: string[]; // hex byte strings like "0x60"
      };
  }
  ```

  On failure the device returns `type: "command_error"` instead. Drivers must
  handle both.

- All byte payloads on the wire are **arrays of single-byte hex strings** like
  `["0xAE", "0xD5"]` (see the `I2C_BYTE_RE` validation in
  `apps/server/src/runtime/deviceSender.ts:30`). There is currently **no hex
  helper anywhere in `packages/core`** - this plan creates one.

- `packages/core/src/i2c/index.ts` - the `@devicesdk/core/i2c` subpath barrel:

  ```ts
  export { type Font, font5x7, getCharData } from "./fonts/font5x7.js";
  export { I2cDevice, type I2cDeviceOptions } from "./I2cDevice.js";
  export { SSD1306, type SSD1306Options } from "./SSD1306.js";
  ```

  `packages/core/package.json` already maps `"./i2c"` to `dist/i2c/index.js`;
  no package.json export changes are needed.

- Tests live in `packages/core/tests/` and run with vitest
  (`packages/core/vitest.config.ts` includes `tests/**/*.test.ts` and
  type-checks `tests/**/*.test-d.ts`). Use
  `packages/core/tests/i2c/SSD1306.test.ts` as the structural pattern
  (plain `describe`/`it`/`expect`, imports from `../../src/...js` with `.js`
  extensions).

- `docs/public/recipes/read-bme280.md` - the recipe that hand-rolls raw I2C
  reads; step 8 rewrites it to use the new driver.

- Repo conventions that apply (from the root `CLAUDE.md` / `AGENTS.md`):
  strict types (no `any`; use `unknown` + narrowing), files under ~700 LOC,
  ESM imports with `.js` extensions inside `packages/core/src`, no em-dashes
  in comments or docs, Bun-specific APIs are forbidden in `packages/*` (these
  run on Node). `packages/core` has **zero runtime dependencies** - keep it
  that way.

## Commands you will need

| Purpose        | Command                                          | Expected on success |
|----------------|--------------------------------------------------|---------------------|
| Install        | `pnpm install`                                   | exit 0              |
| Build core     | `pnpm build --filter @devicesdk/core`            | exit 0              |
| Typecheck core | `pnpm check-types --filter @devicesdk/core`      | exit 0              |
| Test core      | `pnpm test --filter @devicesdk/core`             | all tests pass      |
| Lint (root)    | `pnpm lint`                                      | exit 0              |

Run all commands from the worktree root.

## Scope

**In scope** (the only files you should modify or create):

- `packages/core/src/bytes.ts` (create) - hex byte-string helpers
- `packages/core/src/i2c/sensors/I2cSensor.ts` (create) - read-capable base class
- `packages/core/src/i2c/sensors/BME280.ts` (create)
- `packages/core/src/i2c/sensors/SHT3x.ts` (create)
- `packages/core/src/i2c/sensors/BH1750.ts` (create)
- `packages/core/src/i2c/sensors/ADS1115.ts` (create)
- `packages/core/src/i2c/sensors/INA219.ts` (create)
- `packages/core/src/i2c/index.ts` (add exports)
- `packages/core/src/index.ts` (export `bytes.ts` helpers)
- `packages/core/tests/bytes.test.ts` (create)
- `packages/core/tests/i2c/sensors/*.test.ts` (create, one per driver)
- `docs/public/recipes/read-bme280.md` (rewrite to use the driver)
- `.changeset/i2c-sensor-drivers.md` (create)

**Out of scope** (do NOT touch, even though they look related):

- `packages/core/src/i2c/I2cDevice.ts` and `SSD1306.ts` - the write-batching
  display path works and is published API; do not refactor it to the new base.
- `apps/server/**`, `packages/cli/**`, `firmware/**` - no runtime or firmware
  change is needed; drivers ride existing commands.
- `packages/core/src/commands.ts`, `responses.ts`, `runtime.ts` - no new
  command types; the whole point is to build on the existing surface.
- `packages/core/package.json` `exports` map - `./i2c` already resolves.

## Git workflow

- Create a dedicated worktree first (never work in the main checkout):
  `git worktree add .worktrees/i2c-sensor-drivers -b i2c-sensor-drivers`
- Commit style: conventional commits, e.g.
  `feat(core): add typed I2C sensor drivers (BME280, SHT3x, BH1750, ADS1115, INA219)`
- Run `pnpm lint` before every commit.
- When done: open a PR into `main` with `gh pr create --base main` **only if**
  `git remote get-url origin` points at `github.com/device-sdk/devicesdk`;
  otherwise stop and report.

## Steps

### Step 1: Create hex byte helpers in `packages/core/src/bytes.ts`

The wire format for I2C/SPI/UART data is arrays of single-byte hex strings.
Create `packages/core/src/bytes.ts`:

```ts
/** Convert a byte (0..255) to the wire format hex string, e.g. 175 -> "0xAF". */
export function toHexByte(value: number): string;

/** Convert bytes to the wire format array, e.g. Uint8Array [0,175] -> ["0x00","0xAF"]. */
export function toHexBytes(bytes: Uint8Array | number[]): string[];

/** Parse wire-format hex strings into a Uint8Array. Throws on malformed input. */
export function parseHexBytes(data: string[]): Uint8Array;

/** Read a big-endian unsigned integer from bytes[offset..offset+size). */
export function readUintBE(bytes: Uint8Array, offset: number, size: number): number;

/** Read a little-endian unsigned integer from bytes[offset..offset+size). */
export function readUintLE(bytes: Uint8Array, offset: number, size: number): number;
```

Validation rules: `toHexByte` throws a `RangeError` unless the input is an
integer in 0..255; `parseHexBytes` accepts strings matching
`/^0x[0-9A-Fa-f]{1,2}$/` (same regex as the server's `I2C_BYTE_RE`) and throws
`Error` naming the offending value otherwise. Zero-pad output to two digits
and use uppercase hex digits with a lowercase `0x` prefix (matches existing
firmware output like `"0x60"`).

Export everything from `packages/core/src/index.ts` (add
`export * from "./bytes.js";` to the barrel, and mention the module in the
barrel's header comment the same way the other modules are listed).

**Verify**: `pnpm check-types --filter @devicesdk/core` → exit 0.

### Step 2: Create the read-capable sensor base class

Create `packages/core/src/i2c/sensors/I2cSensor.ts`. Unlike `I2cDevice` (which
only builds commands), sensors need to perform round-trip reads, so the base
class holds a reference to a minimal bus interface that
`DeviceSenderInterface` satisfies structurally:

```ts
import type { DeviceResponse } from "../../responses.js";

/**
 * The minimal I2C surface a sensor driver needs. `this.env.DEVICE`
 * (DeviceSenderInterface) satisfies this structurally; tests pass a mock.
 */
export interface I2cBusLike {
    i2cWrite(bus: number, address: string, data: string[]): Promise<void>;
    i2cRead(
        bus: number,
        address: string,
        bytesToRead: number,
        registerToRead?: string,
    ): Promise<DeviceResponse>;
}

export interface I2cSensorOptions {
    bus?: number; // default 0
    address: string; // 7-bit hex string like "0x76"
}

export class I2cSensor {
    protected readonly device: I2cBusLike;
    protected readonly bus: number;
    protected readonly address: string;

    constructor(device: I2cBusLike, options: I2cSensorOptions) { ... }

    /** Read `length` bytes starting at register `reg`. Throws on command_error
     *  or short read, with a message naming the sensor class, address, and register. */
    protected async readRegister(reg: number, length: number): Promise<Uint8Array>;

    /** Write a single byte `value` to register `reg`. */
    protected async writeRegister(reg: number, value: number): Promise<void>;

    /** Write raw bytes (no register prefix beyond what's in `bytes`). */
    protected async writeBytes(bytes: number[]): Promise<void>;

    /** Sleep helper for sensors with conversion delays. */
    protected sleep(ms: number): Promise<void>;
}
```

Implementation notes:
- `readRegister` calls `this.device.i2cRead(this.bus, this.address, length, toHexByte(reg))`,
  narrows the response: if `response.type !== "i2c_read_result"`, throw an
  `Error` that includes `response.type` (and the `payload.error` string when
  the type is `command_error`). If `payload.data.length < length`, throw a
  short-read error. Return `parseHexBytes(payload.data)`.
- `writeRegister(reg, value)` is `i2cWrite(bus, address, toHexBytes([reg, value]))`.
- Use the helpers from step 1; import with relative `.js` paths.
- Add a type-only test `packages/core/tests/types/i2cBusLike.test-d.ts`
  asserting `DeviceSenderInterface` is assignable to `I2cBusLike`
  (`expectTypeOf<DeviceSenderInterface>().toMatchTypeOf<I2cBusLike>()` with
  vitest's `expectTypeOf`). Follow the existing conventions in
  `packages/core/tests/types/` (look at what is there before writing).

**Verify**: `pnpm test --filter @devicesdk/core` → existing tests still pass
(the type test runs via vitest typecheck).

### Step 3: BME280/BMP280 driver

Create `packages/core/src/i2c/sensors/BME280.ts`. This is the flagship driver;
it must fully implement Bosch compensation. Public API:

```ts
export interface Bme280Reading {
    temperatureC: number;
    pressureHpa: number;
    humidityPct?: number; // undefined on BMP280 (no humidity sensor)
}

export class BME280 extends I2cSensor {
    // constructor(device, { bus = 0, address = "0x76" })
    /** Probe chip ID, load calibration, configure oversampling. Must be called once. */
    async init(): Promise<void>;
    /** Trigger a forced-mode measurement and return compensated values. */
    async read(): Promise<Bme280Reading>;
}
```

Register-level specification (Bosch BME280 datasheet):

1. **Chip ID**: register `0xD0` reads `0x60` for BME280, `0x58` for BMP280.
   Anything else: throw `Error("BME280: unexpected chip ID <id> at <address> - check wiring and address (0x76/0x77)")`.
   Store a `isBmp280` flag when `0x58`.
2. **Calibration**: burst-read 26 bytes from `0x88` (T1..T3, P1..P9, H1 at 0xA1
   is byte index 25). For BME280 additionally read 7 bytes from `0xE1`
   (H2..H6). Parse (LE = little-endian, U = unsigned, S = signed 16-bit
   two's complement):
   - `dig_T1` U16 LE @0x88, `dig_T2` S16 LE @0x8A, `dig_T3` S16 LE @0x8C
   - `dig_P1` U16 LE @0x8E, `dig_P2..dig_P9` S16 LE @0x90..0x9E (step 2)
   - `dig_H1` U8 @0xA1; `dig_H2` S16 LE @0xE1; `dig_H3` U8 @0xE3;
     `dig_H4` = (byte[0xE4] << 4) | (byte[0xE5] & 0x0F), signed 12-bit;
     `dig_H5` = (byte[0xE6] << 4) | (byte[0xE5] >> 4), signed 12-bit;
     `dig_H6` S8 @0xE7.
   Implement signed narrowing explicitly (e.g. `v > 32767 ? v - 65536 : v`).
3. **Configuration** (in `init`): write `ctrl_hum` (0xF2) = 0x01 (humidity
   oversampling x1, skip on BMP280), then `ctrl_meas` (0xF4) = 0x25
   (temp x1, pressure x1, forced mode) is written per-read instead - see below.
4. **read()**: write `ctrl_hum` = 0x01 (BME280 only), write `ctrl_meas` = 0x25
   (forced mode triggers one measurement), `await this.sleep(15)` (max
   measurement time at x1 oversampling is ~10 ms), then burst-read 8 bytes
   from `0xF7`: `adc_P` = bytes 0..2 (20-bit: `(b0<<12)|(b1<<4)|(b2>>4)`),
   `adc_T` = bytes 3..5 (same layout), `adc_H` = bytes 6..7 (16-bit BE).
5. **Compensation**: use the double-precision floating point formulas from the
   datasheet (appendix 8.1), not the int32 fixed-point ones:

   ```ts
   // Temperature
   const var1t = (adc_T / 16384 - dig_T1 / 1024) * dig_T2;
   const var2t = (adc_T / 131072 - dig_T1 / 8192) ** 2 * dig_T3;
   const t_fine = var1t + var2t;
   const temperatureC = t_fine / 5120;
   // Pressure
   let var1 = t_fine / 2 - 64000;
   let var2 = (var1 * var1 * dig_P6) / 32768;
   var2 = var2 + var1 * dig_P5 * 2;
   var2 = var2 / 4 + dig_P4 * 65536;
   var1 = ((dig_P3 * var1 * var1) / 524288 + dig_P2 * var1) / 524288;
   var1 = (1 + var1 / 32768) * dig_P1;
   let p = 1048576 - adc_P;
   p = ((p - var2 / 4096) * 6250) / var1; // var1 === 0 -> throw (division guard)
   var1 = (dig_P9 * p * p) / 2147483648;
   var2 = (p * dig_P8) / 32768;
   p = p + (var1 + var2 + dig_P7) / 16; // Pa
   const pressureHpa = p / 100;
   // Humidity (BME280 only)
   let h = t_fine - 76800;
   h = (adc_H - (dig_H4 * 64 + (dig_H5 / 16384) * h)) *
       ((dig_H2 / 65536) * (1 + (dig_H6 / 67108864) * h * (1 + (dig_H3 / 67108864) * h)));
   h = h * (1 - (dig_H1 * h) / 524288);
   const humidityPct = Math.min(100, Math.max(0, h));
   ```

6. `read()` before `init()` must throw `Error("BME280: call init() before read()")`.

Test vector (from the Bosch BMP280 datasheet worked example, valid for the
shared T/P formulas): with `dig_T1=27504, dig_T2=26435, dig_T3=-1000` and
`adc_T=519888` the compensated temperature is **25.08 °C** (assert
`toBeCloseTo(25.08, 2)`); with `dig_P1=36477, dig_P2=-10685, dig_P3=3024,
dig_P4=2855, dig_P5=140, dig_P6=-7, dig_P7=15500, dig_P8=-14600, dig_P9=6000`
and `adc_P=415148` (same adc_T for t_fine) the compensated pressure is
**100653.27 Pa** ≈ 1006.53 hPa (assert `toBeCloseTo(1006.53, 1)`).

**Verify**: `pnpm test --filter @devicesdk/core` → BME280 tests pass,
including the datasheet vector.

### Step 4: SHT3x driver

Create `packages/core/src/i2c/sensors/SHT3x.ts`:

```ts
export class SHT3x extends I2cSensor {
    // constructor(device, { bus = 0, address = "0x44" })  // 0x45 when ADDR pin high
    async read(): Promise<{ temperatureC: number; humidityPct: number }>;
}
```

- `read()`: send the single-shot, high-repeatability, clock-stretching-disabled
  command by writing bytes `[0x2C, 0x06]` (use `writeBytes`, this is a 16-bit
  command, not a register write), `sleep(20)`, then read 6 bytes **without a
  register prefix** (call `this.device.i2cRead(bus, address, 6)` with no
  `registerToRead`; add a protected `readBytes(length)` helper on `I2cSensor`
  for register-less reads if not already present).
- Frame: `[tempMSB, tempLSB, tempCRC, rhMSB, rhLSB, rhCRC]`. Verify both CRCs
  with CRC-8 (polynomial 0x31, init 0xFF, no reflection, no final XOR) and
  throw on mismatch.
- Formulas: `temperatureC = -45 + 175 * rawT / 65535`;
  `humidityPct = 100 * rawRH / 65535`.
- CRC test vector: CRC-8/0x31/init 0xFF over bytes `[0xBE, 0xEF]` = `0x92`
  (from the Sensirion datasheet). Unit-test the CRC function directly (export
  it as a named function `sht3xCrc8` for testability).

**Verify**: `pnpm test --filter @devicesdk/core` → SHT3x tests pass, including
the CRC vector and a full read with a mocked 6-byte frame.

### Step 5: BH1750 driver

Create `packages/core/src/i2c/sensors/BH1750.ts`:

```ts
export class BH1750 extends I2cSensor {
    // constructor(device, { bus = 0, address = "0x23" })  // 0x5C when ADDR high
    async read(): Promise<{ lux: number }>;
}
```

- `read()`: write byte `0x01` (power on), write byte `0x20` (one-time
  high-resolution mode), `sleep(180)` (max measurement time), read 2 bytes
  register-less; `lux = ((msb << 8) | lsb) / 1.2`, rounded to 1 decimal.

**Verify**: `pnpm test --filter @devicesdk/core` → BH1750 test passes
(mock returning `["0x83", "0x90"]` → 33680/1.2 ≈ 28066.7 lux).

### Step 6: ADS1115 and INA219 drivers

Create `packages/core/src/i2c/sensors/ADS1115.ts`:

```ts
export type Ads1115Gain = "6.144V" | "4.096V" | "2.048V" | "1.024V" | "0.512V" | "0.256V";
export class ADS1115 extends I2cSensor {
    // constructor(device, { bus = 0, address = "0x48", gain = "2.048V" })
    /** Single-ended read of channel 0..3, returns volts. */
    async readChannel(channel: 0 | 1 | 2 | 3): Promise<{ raw: number; volts: number }>;
}
```

- Config register 0x01, conversion register 0x00 (both 16-bit big-endian;
  register writes here are `writeBytes([reg, msb, lsb])`).
- Config word: OS=1 (bit 15, start single conversion), MUX=`0b100 + channel`
  (bits 14-12), PGA per gain (bits 11-9: 6.144V=000, 4.096V=001, 2.048V=010,
  1.024V=011, 0.512V=100, 0.256V=101), MODE=1 (bit 8, single-shot),
  DR=`0b100` 128SPS (bits 7-5), comparator disabled (bits 1-0 = 11). For the
  default gain the word is `0xC383 + (channel << 12)`.
- After writing config, `sleep(10)` (128 SPS = 7.8 ms/conversion), read 2
  bytes from register 0x00, interpret as signed 16-bit BE;
  `volts = raw * fullScale / 32768` where fullScale is the gain's voltage.

Create `packages/core/src/i2c/sensors/INA219.ts`:

```ts
export class INA219 extends I2cSensor {
    // constructor(device, { bus = 0, address = "0x40", shuntOhms = 0.1, maxExpectedAmps = 2 })
    async init(): Promise<void>; // writes the calibration register
    async read(): Promise<{ busVoltageV: number; shuntVoltageMv: number; currentA: number; powerW: number }>;
}
```

- Registers (16-bit BE): config 0x00, shunt voltage 0x01 (signed, LSB 10 µV),
  bus voltage 0x02 (value = `raw >> 3`, LSB 4 mV), power 0x03, current 0x04
  (signed), calibration 0x05.
- `init()`: `currentLsb = maxExpectedAmps / 32768`;
  `cal = Math.trunc(0.04096 / (currentLsb * shuntOhms))`; write `cal` to 0x05.
  Store `currentLsb`; `powerLsb = 20 * currentLsb`.
- `read()`: current = signed(reg 0x04) * currentLsb; power = reg 0x03 * powerLsb;
  guard `init()` not called like BME280 does.

**Verify**: `pnpm test --filter @devicesdk/core` → ADS1115 + INA219 tests pass.

### Step 7: Export from the i2c barrel

Add to `packages/core/src/i2c/index.ts` (keep alphabetical-ish grouping,
types exported with `type`):

```ts
export { ADS1115, type Ads1115Gain } from "./sensors/ADS1115.js";
export { BH1750 } from "./sensors/BH1750.js";
export { BME280, type Bme280Reading } from "./sensors/BME280.js";
export { INA219 } from "./sensors/INA219.js";
export { type I2cBusLike, I2cSensor, type I2cSensorOptions } from "./sensors/I2cSensor.js";
export { SHT3x, sht3xCrc8 } from "./sensors/SHT3x.js";
```

**Verify**: `pnpm build --filter @devicesdk/core` → exit 0, and
`node -e "import('./packages/core/dist/i2c/index.js').then(m => console.log(Object.keys(m)))"`
lists all new drivers.

### Step 8: Rewrite the BME280 recipe to use the driver

Rewrite the script section of `docs/public/recipes/read-bme280.md`: keep the
frontmatter, wiring table, and `devicesdk.ts` section as they are; replace the
hand-rolled chip-ID/`i2cRead` code in `src/devices/envSensor.ts` with the
driver:

```ts
import { DeviceEntrypoint } from "@devicesdk/core";
import { BME280 } from "@devicesdk/core/i2c";
import { Pico } from "@devicesdk/core/devices/pico";

export class EnvSensor extends DeviceEntrypoint {
    crons = { sample: "*/1 * * * *" };
    private sensor?: BME280;

    async onDeviceConnect() {
        await this.env.DEVICE.sendCommand(Pico.i2c({ bus: 0, sda_pin: 0, scl_pin: 1 }));
        this.sensor = new BME280(this.env.DEVICE, { address: "0x76" });
        await this.sensor.init();
    }

    async onCron() {
        if (!this.sensor) return;
        const { temperatureC, humidityPct, pressureHpa } = await this.sensor.read();
        console.log(`${temperatureC.toFixed(1)}°C, ${humidityPct?.toFixed(0)}% RH, ${pressureHpa.toFixed(1)} hPa`);
    }
}
```

Adjust surrounding prose to match (the recipe no longer needs to explain the
chip-ID register), and keep the description frontmatter accurate.

**Verify**: `pnpm lint` → exit 0 (and re-read the recipe top to bottom for
consistency - no references to removed code).

### Step 9: Changeset

Create `.changeset/i2c-sensor-drivers.md`:

```md
---
'@devicesdk/core': minor
'@devicesdk/website': patch
---

Add a typed I2C sensor driver library under `@devicesdk/core/i2c`: BME280/BMP280
(temperature/humidity/pressure with full Bosch compensation), SHT3x, BH1750,
ADS1115, and INA219, plus the read-capable `I2cSensor` base class and hex byte
helpers. The read-bme280 recipe now uses the driver.
```

**Verify**: `git status` shows only in-scope files; `pnpm lint` → exit 0.

## Test plan

- `packages/core/tests/bytes.test.ts`: round-trip `toHexBytes`/`parseHexBytes`,
  padding (`toHexByte(0)` → `"0x00"`), rejection of `"0xZZ"`, `256`, `-1`,
  `1.5`; `readUintBE`/`readUintLE` on known buffers.
- `packages/core/tests/i2c/sensors/I2cSensor.test.ts`: `readRegister` happy
  path (mock returns `i2c_read_result`), throws on `command_error` (message
  contains the device error string), throws on short read.
- `packages/core/tests/i2c/sensors/BME280.test.ts`: chip-ID mismatch throws;
  BMP280 (`0x58`) yields `humidityPct: undefined`; datasheet T/P vector from
  step 3; `read()` before `init()` throws. Build the mock so `i2cRead` answers
  by `registerToRead` value (a `Map<string, string[]>` of canned frames).
- `packages/core/tests/i2c/sensors/SHT3x.test.ts`: CRC vector `[0xBE,0xEF]` →
  `0x92`; full read with valid frame; corrupted CRC throws.
- `packages/core/tests/i2c/sensors/BH1750.test.ts`,
  `ADS1115.test.ts`, `INA219.test.ts`: one happy-path conversion each with
  hand-computed expected values; INA219 calibration register write asserted
  (spy on `i2cWrite` and check the bytes).
- Model all of them structurally after `packages/core/tests/i2c/SSD1306.test.ts`.
- Verification: `pnpm test --filter @devicesdk/core` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check-types --filter @devicesdk/core` exits 0
- [ ] `pnpm build --filter @devicesdk/core` exits 0
- [ ] `pnpm test --filter @devicesdk/core` exits 0 with new test files for
      bytes + all five drivers present
- [ ] `pnpm lint` exits 0
- [ ] `grep -c "0xD0" docs/public/recipes/read-bme280.md` returns 0 (raw
      chip-ID plumbing removed from the recipe)
- [ ] `.changeset/i2c-sensor-drivers.md` exists and names `@devicesdk/core`
      (minor) and `@devicesdk/website` (patch)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 004 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `packages/core/src/i2c/index.ts` or `runtime.ts` no longer match the
  "Current state" excerpts (drift).
- `packages/core/tests/types/` does not exist or uses a convention other than
  vitest `*.test-d.ts` files - report what you find instead of inventing one.
- You are tempted to add a runtime dependency to `packages/core` - the package
  must stay dependency-free.
- The BME280 datasheet vector fails after two attempts at the compensation
  math - report the computed values, do not fudge tolerances.
- Any change seems to require touching `apps/server` or `packages/cli`.

## Maintenance notes

- Future sensor drivers should extend `I2cSensor` and be added to the
  `i2c/index.ts` barrel; keep one file per driver, under ~300 LOC.
- Plan 005 (Modbus RTU) reuses `packages/core/src/bytes.ts` from step 1 - do
  not move or rename it without checking that plan.
- Reviewer scrutiny: the signed-integer narrowing in BME280 calibration
  parsing (dig_H4/dig_H5 12-bit packing is the classic bug), and that no
  `any` types crept into the response narrowing.
- Deferred: SSD1306/`I2cDevice` unification with `I2cSensor` (write-batching
  vs round-trip models are genuinely different); a docs guide page listing all
  supported sensors (worth doing once drivers stabilize); HA recipe updates
  showing `emitState` of driver readings.
