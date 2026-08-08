# Plan 006: Add OneWire (DS18B20) and DHT (DHT11/DHT22) sensor protocols end to end

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 321ef7e..HEAD -- packages/core apps/server/src/runtime packages/cli/src/simulator firmware`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Toolchain reality check**: this machine has neither `cmake`, `pytest`,
> ESP-IDF, nor the Pico SDK (the firmware `pnpm test`/`build` scripts
> deliberately print "Skipping ... not found" in that case). Firmware code is
> verified here by host unit tests **in CI** and by the owner on hardware.
> Phases A is fully verifiable locally; phases B/C are verified by CI on the
> PR. Do not claim firmware behavior is verified locally.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (two firmware stacks, microsecond timing code, limited local verification)
- **Depends on**: none (independent of plans 004/005)
- **Category**: direction
- **Planned at**: commit `321ef7e`, 2026-07-05

## Why this matters

The DS18B20 (OneWire) and DHT22/DHT11 are the two most common hobbyist
temperature sensors, and they are the ones DeviceSDK **cannot** support from
TypeScript: both use single-wire protocols with microsecond-level bit timing,
so the read must happen in firmware, not over WebSocket round trips. Adding
`onewire_*` and `dht_read` commands to both firmwares plus the typed surface in
`@devicesdk/core` closes the most-asked "can it read my temperature sensor"
gap that the I2C driver library (plan 004) cannot reach: DS18B20s are the
standard for waterproof probes and multi-drop bus wiring (many sensors on one
pin).

## Current state

### The command pipeline (all layers a new command touches)

1. **Types**: `packages/core/src/commands.ts` defines `Command<T, P>` variants
   and the `DeviceCommand` union (see `GetTemperatureCommand`, lines 132-136,
   as the minimal example). `packages/core/src/responses.ts` defines response
   interfaces, the `DeviceResponse` union (lines 103-114), and
   `CommandResponseTypeMap` (lines 117-142) mapping command type strings to
   response types (e.g. `get_temperature: TemperatureResult`).
2. **Script-facing interface**: `packages/core/src/runtime.ts`
   `DeviceSenderInterface` declares typed convenience methods (e.g.
   `getTemperature(): Promise<DeviceResponse>` at line 213) with detailed
   JSDoc including `@example` blocks - match that style.
3. **Server implementation**: `apps/server/src/runtime/deviceSender.ts`
   implements the interface. Pattern (line 291):

   ```ts
   async getTemperature(): Promise<DeviceResponse> {
       return this.sendCommandAndWait({ type: "get_temperature", payload: {} });
   }
   ```

   It also has client-side validators at the top (`validatePin`,
   `fail(field, got, expected, docs)`) - new methods must validate inputs the
   same way. The server does not otherwise whitelist command types; responses
   correlate purely by echoed `id`
   (`apps/server/src/runtime/deviceSession.ts:216`), and unanswered commands
   time out after **5 seconds** (`deviceSession.ts:402`). A DS18B20 12-bit
   conversion takes 750 ms, well within budget.
4. **CLI simulator**: `packages/cli/src/simulator/localDeviceSender.ts`
   implements the same interface for `devicesdk dev` (see its
   `getTemperature` at line 156). New methods must be added with plausible
   fake data. `packages/cli/src/commands/init.ts:306` embeds a doc-string
   list of available methods in the scaffolded project - extend it.
5. **ESP32 firmware** (`firmware/esp32/main/`, C, ESP-IDF):
   - `websocket_handler.c` parses incoming JSON: a `strcmp(type, ...)` chain
     (e.g. `get_temperature` at line 322) fills a fixed-size
     `worker_command_t` (union of payload structs in `command_queue.h`,
     e.g. `MAX_I2C_DATA_LEN 256` buffers) and calls `queue_command(&cmd)`.
   - `worker_task.c` dispatches on `cmd->type` in a switch
     (`worker_execute_command`, line 71) to `handle_*` functions that call
     HAL functions and fill a `worker_response_t`.
   - `hal.h`/`hal.c` declare/implement `devicesdk_hal_*` functions
     (host-test stubs at the top of `hal.c`, real implementations below,
     e.g. `devicesdk_hal_get_temperature` at line 434).
   - `devicesdk_main.c` serializes `worker_response_t` back to JSON frames
     (see the `uart_read_result` construction at lines 241-249).
   - Components come from the IDF component registry via
     `main/idf_component.yml` (currently `espressif/esp_websocket_client`
     and `espressif/led_strip`).
   - Host unit tests: `firmware/esp32/test/unit/test_websocket_handler.cpp`,
     `test_worker_commands.cpp` with mocks in `test/mocks/` (cmake-based,
     run in CI).
6. **Pico firmware** (`firmware/pico/`, C++, Pico SDK): same shape -
   `src/websocket_handler.cpp` parses (`else if (type == "pio_ws2812_configure")`
   at line 686), `src/multicore/command_queue.h` holds the payload union,
   `src/multicore/core1_worker.cpp` dispatches (`handle_*` functions, switch
   at line ~635) on core 1, `src/hal.h`/`src/hal.cpp` is the HAL. Host unit
   tests in `firmware/pico/test/unit/`. Find the response-JSON serialization
   site with `grep -rn "uart_read_result" firmware/pico/src` and follow that
   pattern.

### Conventions and release mechanics

- Firmware changes **must** carry changesets for `@devicesdk/firmware-esp32`
  and/or `@devicesdk/firmware-pico` - the version bump is what triggers the
  firmware build + release workflows (`.github/workflows/firmware-*.yml`).
  No changeset = the firmware never ships.
- CI runs on `[self-hosted, linux, proxmox-ephemeral]` runners with a base
  image maintained by the owner. If a build needs a new **system** package,
  STOP and ask; IDF component-registry dependencies (downloaded by
  `idf.py build`) are fine - the existing build already fetches them.
- Repo code standards: strict types in TS, files under ~700 LOC, no
  em-dashes, `crypto.randomUUID()` for IDs.

## Commands you will need

| Purpose            | Command                                       | Expected on success |
|--------------------|-----------------------------------------------|---------------------|
| Install            | `pnpm install`                                | exit 0              |
| Typecheck core     | `pnpm check-types --filter @devicesdk/core`   | exit 0              |
| Test core          | `pnpm test --filter @devicesdk/core`          | all pass            |
| Typecheck server   | `pnpm check-types --filter @devicesdk/server` | exit 0              |
| Test server        | `pnpm test --filter @devicesdk/server`        | all pass            |
| Test CLI           | `pnpm test --filter @devicesdk/cli`           | all pass            |
| Lint (root)        | `pnpm lint`                                   | exit 0              |
| Firmware tests     | (CI only on this machine)                     | green check on PR   |

## Scope

**In scope**:

- `packages/core/src/commands.ts`, `responses.ts`, `runtime.ts` (add types + methods)
- `apps/server/src/runtime/deviceSender.ts` (implement methods)
- `packages/cli/src/simulator/localDeviceSender.ts` (simulate methods)
- `packages/cli/src/commands/init.ts` (extend the method list doc string only)
- `firmware/esp32/main/` - `websocket_handler.c`, `command_queue.h`,
  `worker_task.c`, `hal.h`, `hal.c`, `devicesdk_main.c`,
  `idf_component.yml`; new files `onewire_dht.c/.h` if you prefer separate
  files (ESP32 keeps handlers in `worker_task.c`/`hal.c` today - staying in
  those files is also fine while they remain under ~1000 LOC)
- `firmware/esp32/test/unit/` + `test/mocks/` (extend)
- `firmware/pico/src/` - `websocket_handler.cpp`,
  `multicore/command_queue.h`, `multicore/core1_worker.cpp`, `hal.h`,
  `hal.cpp`
- `firmware/pico/test/unit/` + `test/mocks/` (extend)
- `docs/public/recipes/ds18b20-probe.md` (create)
- `.changeset/onewire-dht.md` (create)

**Out of scope** (do NOT touch):

- `apps/server/src/runtime/deviceSession.ts` - the 5 s timeout and
  correlation logic need no change.
- `apps/dashboard/**` - sensor values reach the dashboard via existing
  log/state streams.
- iButton/EEPROM OneWire devices, DS18S20, parasite-power mode, and CRC-based
  bus healing - DS18B20 external-power with optional multi-drop only.
- OTA, provisioning, or any other roadmap firmware item.

## Git workflow

- Worktree first: `git worktree add .worktrees/onewire-dht -b onewire-dht`
- Conventional commits, one per phase, e.g.
  `feat(core): add onewire/dht command types and sender methods`,
  `feat(firmware-pico): DS18B20 + DHT bit-bang drivers`,
  `feat(firmware-esp32): DS18B20 (onewire_bus RMT) + DHT drivers`.
- `pnpm lint` before every commit.
- PR into `main` via `gh pr create --base main` **only if** `origin` is
  `github.com/device-sdk/devicesdk`; otherwise stop and report. The PR
  description must state that hardware validation by the owner is pending.

## Protocol contract (design - all phases implement exactly this)

New commands (add to `DeviceCommand` union):

```ts
// Enumerate DS18B20 ROM codes on the bus attached to `pin`.
export type OnewireSearchCommand = Command<"onewire_search", { pin: number }>;

// Read temperature. `rom` omitted = Skip ROM (single sensor on the bus);
// `rom` = 16 uppercase hex chars (64-bit ROM code, e.g. "28FF641E8D3C4A41").
export type OnewireReadTempCommand = Command<
    "onewire_read_temp",
    { pin: number; rom?: string }
>;

export type DhtReadCommand = Command<
    "dht_read",
    { pin: number; model: "dht11" | "dht22" }
>;
```

New responses (add to `DeviceResponse` union and `CommandResponseTypeMap`):

```ts
export interface OnewireSearchResult extends BaseResponse {
    type: "onewire_search_result";
    payload: { pin: number; roms: string[] }; // 16-hex-char ROM codes, may be empty
}
export interface OnewireTempResult extends BaseResponse {
    type: "onewire_temp_result";
    payload: { pin: number; rom: string; celsius: number }; // rom "" for Skip ROM reads
}
export interface DhtReadResult extends BaseResponse {
    type: "dht_read_result";
    payload: { pin: number; celsius: number; humidity_pct: number };
}
// CommandResponseTypeMap additions:
// onewire_search: OnewireSearchResult
// onewire_read_temp: OnewireTempResult
// dht_read: DhtReadResult
```

New `DeviceSenderInterface` methods (JSDoc with wiring notes: DS18B20 needs a
4.7 kΩ pull-up from data to 3V3; DHT sensors cannot be read more often than
every 2 s):

```ts
onewireSearch(pin: number): Promise<DeviceResponse>;
onewireReadTemperature(pin: number, rom?: string): Promise<DeviceResponse>;
dhtRead(pin: number, model: "dht11" | "dht22"): Promise<DeviceResponse>;
```

Errors (bad CRC, no presence pulse, sensor timeout) come back as the existing
`command_error` response with a descriptive `error` string - no new error
envelope.

Firmware limits: max 8 ROM codes per search response (fixed array in the
response struct); ROM codes are hex-encoded uppercase without a `0x` prefix.

## Steps

### Phase A - TypeScript surface (fully verifiable locally)

#### Step A1: Core types

Add the commands/responses/map entries and interface methods from the
contract above to `packages/core/src/commands.ts`, `responses.ts`, and
`runtime.ts`. Match existing formatting exactly (tab indentation, JSDoc
style, union ordering: append after the PIO entries).

**Verify**: `pnpm check-types --filter @devicesdk/core` → exit 0;
`pnpm test --filter @devicesdk/core` → pass.

#### Step A2: Server sender

Implement the three methods in `apps/server/src/runtime/deviceSender.ts`,
using `sendCommandAndWait`, `validatePin`, and `fail(...)` for input
validation (rom must match `/^[0-9A-F]{16}$/` when present; model must be
`"dht11" | "dht22"` - the type system enforces it but validate at runtime too,
this is a boundary). Point the `docs` argument of `fail` at
`https://devicesdk.com/docs/concepts/device-api/` like neighboring methods do.

**Verify**: `pnpm check-types --filter @devicesdk/server` and
`pnpm test --filter @devicesdk/server` → exit 0 / all pass.

#### Step A3: CLI simulator + init doc string

In `packages/cli/src/simulator/localDeviceSender.ts` add the three methods
returning plausible canned data (e.g. search → one ROM
`"28FF641E8D3C4A41"`, temperature 21.5 ± jitter, DHT 21.5 °C / 45 %),
following the file's existing style for simulated responses (read the
neighboring methods first). Extend the method list in
`packages/cli/src/commands/init.ts:306` to mention
`onewireSearch/onewireReadTemperature`, `dhtRead`.

**Verify**: `pnpm test --filter @devicesdk/cli` → all pass;
`pnpm lint` → exit 0. Commit phase A.

### Phase B - Pico firmware (bit-bang, verified via host tests in CI)

#### Step B1: Payload structs and parsing

In `firmware/pico/src/multicore/command_queue.h` add command enum values
(`CMD_ONEWIRE_SEARCH`, `CMD_ONEWIRE_READ_TEMP`, `CMD_DHT_READ`) and payload
structs to the union: `{ uint8_t pin; }`, `{ uint8_t pin; bool has_rom;
uint8_t rom[8]; }`, `{ uint8_t pin; uint8_t model; }` (model 0 = dht11,
1 = dht22), plus response payloads: search
`{ uint8_t pin; uint8_t count; uint8_t roms[8][8]; }`, temp
`{ uint8_t pin; uint8_t rom[8]; bool has_rom; float celsius; }`, dht
`{ uint8_t pin; float celsius; float humidity_pct; }`. In
`src/websocket_handler.cpp`, extend the `else if (type == ...)` chain
following the `pio_ws2812_configure` block at line 686: validate pin is a
number 0-28, parse the optional `rom` hex string into 8 bytes (reject on bad
length/characters), and `queue_command`.

#### Step B2: HAL - OneWire

In `src/hal.h`/`src/hal.cpp` add:

```c
// Returns count found (0..max_roms), or -1 on bus error (no presence pulse).
int hal_onewire_search(uint8_t pin, uint8_t roms[][8], int max_roms);
// rom == NULL -> Skip ROM. Returns true and sets *celsius on success.
// Fails on missing presence pulse or scratchpad CRC mismatch.
bool hal_onewire_read_temp(uint8_t pin, const uint8_t *rom, float *celsius);
```

Implementation, standard Maxim timings, bit-banged on the worker core
(core 1). Time with `time_us_64()`/busy-wait; wrap each *bit slot* (not whole
bytes) in `save_and_disable_interrupts()` / `restore_interrupts()`:

- Reset: drive low 480 µs, release, sample presence at ~70 µs, wait to 480 µs.
- Write bit: low 6 µs then release for 64 µs (1), or low 60 µs then release
  10 µs (0). Read bit: low 6 µs, release, sample at 9 µs, wait to 70 µs.
- `read_temp`: reset → (Match ROM 0x55 + 8 rom bytes | Skip ROM 0xCC) →
  Convert T 0x44 → `sleep_ms(750)` → reset → address again → Read Scratchpad
  0xBE → read 9 bytes → verify CRC8 (poly 0x8C reflected, init 0) →
  `celsius = (int16_t)((b1 << 8) | b0) / 16.0f`.
- `search`: implement the standard Maxim ROM-search tree walk (0xF0), cap at
  `max_roms`, verify each ROM's CRC8.
- The 750 ms conversion intentionally blocks core 1 (other queued commands
  wait); that is the existing execution model - do not spawn tasks.

#### Step B3: HAL - DHT

```c
// model: 0 = DHT11, 1 = DHT22. Fails on timeout or checksum mismatch.
bool hal_dht_read(uint8_t pin, uint8_t model, float *celsius, float *humidity_pct);
```

Start signal: output low 20 ms (DHT11) / 2 ms (DHT22), release, wait for the
sensor's 80 µs low + 80 µs high preamble, then read 40 bits: each bit is a
~50 µs low followed by a high of ~26 µs (0) or ~70 µs (1) - threshold at
40 µs measured with `time_us_64()`. Disable interrupts for the whole 40-bit
read (~5 ms). Verify checksum (byte 4 = sum of bytes 0-3). Decode: DHT22
humidity = ((b0<<8)|b1)/10, temp = ((b2&0x7F)<<8|b3)/10 with sign bit b2&0x80;
DHT11 humidity = b0, temp = b2. Enforce a minimum 2 s interval between reads
per pin (return an error mentioning "min 2s between DHT reads" if violated;
keep a static last-read timestamp per pin).

#### Step B4: Dispatch + response serialization

Add `handle_onewire_search`, `handle_onewire_read_temp`, `handle_dht_read`
to `src/multicore/core1_worker.cpp` following `handle_get_temperature`
(line 435): call the HAL, set `RESPONSE_ERROR` with a message on failure.
Find the JSON response construction site
(`grep -rn "uart_read_result" firmware/pico/src`) and add the three response
frames per the protocol contract (ROM bytes hex-encoded uppercase,
`snprintf("%02X", ...)` per byte).

#### Step B5: Pico host unit tests

Extend `firmware/pico/test/` (mocks live in `test/mocks/`): parsing tests
for the three new message types (valid, missing pin, malformed rom) modeled
on `test/unit/test_i2c_commands.cpp`, and a dispatch test asserting a mocked
`hal_dht_read` failure produces an error response. Register new files in
`firmware/pico/test/CMakeLists.txt`.

**Verify (local)**: `pnpm lint` → exit 0 (C++ is not linted by Biome, but the
TS/JSON around it is); commit phase B. Firmware compile + tests run in CI.

### Phase C - ESP32 firmware

#### Step C1: Components

Add to `firmware/esp32/main/idf_component.yml`:
`espressif/onewire_bus: '*'` (RMT-backed OneWire bus driver, same registry the
existing `espressif/led_strip` comes from). Implement DS18B20 command/CRC
logic on top of it (reset/write/read via the component; the Convert T /
Read Scratchpad sequence and CRC as in phase B2 - the timings come free from
the RMT driver). Do **not** bit-bang OneWire on ESP32.

#### Step C2: Wire the pipeline

Mirror phase B on the ESP32 layout: enum + payload structs in
`main/command_queue.h`, JSON parsing in `main/websocket_handler.c` (follow
the `get_temperature` block at line 322 and the validation style of the
`i2c_read` block at lines 300-320), HAL functions
`devicesdk_hal_onewire_search` / `devicesdk_hal_onewire_read_temp` /
`devicesdk_hal_dht_read` in `main/hal.h`/`main/hal.c` (add no-op host-test
stubs at the top of `hal.c` exactly like the existing stubs at lines 19-28),
dispatch in `main/worker_task.c` (`worker_execute_command` switch), and JSON
response construction in `main/devicesdk_main.c` (follow the
`uart_read_result` block at lines 241-249).

DHT on ESP32: bit-bang as in phase B3 using `esp_rom_delay_us` for the start
signal and `esp_timer_get_time()` for pulse measurement, inside a
`portENTER_CRITICAL` / `portEXIT_CRITICAL` section for the 40-bit read
(define a local `portMUX_TYPE`). Same 2 s per-pin rate limit and checksum
handling.

#### Step C3: ESP32 host unit tests

Extend `firmware/esp32/test/unit/test_websocket_handler.cpp` (parsing) and
`test_worker_commands.cpp` (dispatch with mocked HAL), mirroring the existing
cases; register in `firmware/esp32/test/CMakeLists.txt` if files are listed
explicitly.

**Verify (local)**: `pnpm lint` → exit 0; commit phase C. CI must pass on
the PR (both firmware workflows and `ci.yml`).

### Phase D - Docs + changeset

#### Step D1: Recipe

Create `docs/public/recipes/ds18b20-probe.md` modeled on
`docs/public/recipes/read-bme280.md` (same frontmatter shape: title as a
question, description, `social_image: /og-images/docs/recipes/ds18b20-probe.png`):
wiring table (data pin + 4.7 kΩ pull-up to 3V3), a script that calls
`onewireSearch` in `onDeviceConnect` and `onewireReadTemperature` on a cron,
and a note that DHT22 works the same via `dhtRead(pin, "dht22")` with a
minimum 2 s read interval.

#### Step D2: Changeset

Create `.changeset/onewire-dht.md`:

```md
---
'@devicesdk/core': minor
'@devicesdk/server': minor
'@devicesdk/cli': minor
'@devicesdk/firmware-esp32': minor
'@devicesdk/firmware-pico': minor
'@devicesdk/website': patch
---

Add OneWire (DS18B20) and DHT11/DHT22 sensor support: new
`onewire_search`, `onewire_read_temp`, and `dht_read` commands implemented in
both firmwares, with typed `onewireSearch` / `onewireReadTemperature` /
`dhtRead` methods on `this.env.DEVICE` and simulator support in
`devicesdk dev`. New recipe: DS18B20 waterproof probe.
```

**Verify**: `git status` clean of out-of-scope files; `pnpm lint` → exit 0.

## Test plan

- **Core** (`packages/core/tests/types/` or a new
  `tests/commands.test-d.ts`): type-level assertions that the three new
  command types are members of `DeviceCommand` and that
  `CommandResponseTypeMap["onewire_read_temp"]` is `OnewireTempResult`.
- **Server** (`apps/server/`, bun test - follow an existing runtime test if
  one covers deviceSender; run
  `ls apps/server/src/**/*.test.ts apps/server/test 2>/dev/null` to find the
  layout first): validation tests - `onewireReadTemperature(5, "xyz")` throws
  `invalid_argument`, valid ROM passes through to the transport mock.
- **CLI** (vitest): the simulator returns the canned shapes for all three
  methods.
- **Firmware host tests** (CI): as in steps B5/C3 - JSON parse accept/reject
  cases and dispatch-with-mocked-HAL cases per platform.
- Verification: the three local suites via the commands table; firmware
  suites green in CI on the PR.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check-types --filter @devicesdk/core` and
      `--filter @devicesdk/server` exit 0
- [ ] `pnpm test --filter @devicesdk/core`, `--filter @devicesdk/server`,
      `--filter @devicesdk/cli` all exit 0
- [ ] `pnpm lint` exits 0
- [ ] `grep -n "onewire_read_temp" packages/core/src/commands.ts
      apps/server/src/runtime/deviceSender.ts
      packages/cli/src/simulator/localDeviceSender.ts
      firmware/esp32/main/websocket_handler.c
      firmware/pico/src/websocket_handler.cpp` → one or more hits in every file
- [ ] `.changeset/onewire-dht.md` exists and includes both firmware packages
- [ ] `docs/public/recipes/ds18b20-probe.md` exists
- [ ] `git status` shows no files outside the in-scope list
- [ ] CI green on the PR (firmware unit tests + builds included)
- [ ] `plans/README.md` status row for 006 updated, noting "hardware
      validation pending" until the owner confirms on real sensors

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt (dispatch sites, HAL stub layout, payload-union
  headers) doesn't match the live code (drift).
- `espressif/onewire_bus` is not resolvable from the IDF component registry
  for all three targets (esp32, esp32c3, esp32c61) - report; do not fall back
  to bit-banging OneWire on ESP32 without the owner's decision.
- The fixed-size `worker_command_t`/response unions cannot fit the new
  payloads without growing a buffer that other code sizes against
  (grep for the constant before changing it) - report the size math.
- CI firmware builds fail for a missing **system** package on the runner
  image - per repo policy, the owner must add it to the base image; do not
  work around with userspace installs.
- You cannot find the Pico response-serialization site via the grep in step
  B4.
- Anything seems to require touching `deviceSession.ts` or the watch
  protocol.

## Maintenance notes

- Hardware validation is a human step: the owner should confirm on a real
  DS18B20 (single + multi-drop) and a DHT22 on both Pico W and ESP32-C3
  before the firmware release PR ("Version packages") is merged - the
  changeset alone will trigger a rolling firmware release once merged.
- The 2 s DHT rate limit is per pin and in-firmware; if users report
  `command_error` storms, the fix belongs in their cron cadence, not the
  limit.
- Future OneWire devices (DS2413 GPIO, iButton) should reuse the reset/bit
  primitives; if a second device type lands, extract the bus walk into a
  shared firmware module rather than copying it.
- Reviewer scrutiny: interrupt-disable windows (must cover bit slots, not
  the 750 ms conversion wait), signed DHT22 temperatures (b2 & 0x80), ROM
  hex encoding endianness (byte 0 = family code 0x28 first), and that the
  ESP32 host-test stubs at the top of `hal.c` were extended so host tests
  still link.
- Deferred: parasite-power DS18B20 support (needs strong pull-up GPIO
  control), configurable resolution (9-12 bit trade-off between 94-750 ms
  conversion), OneWire on the simulator beyond canned data.
