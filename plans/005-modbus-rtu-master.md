# Plan 005: Add a Modbus RTU master to @devicesdk/core over the existing UART commands

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 321ef7e..HEAD -- packages/core docs/public/guides`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW (pure TypeScript over an existing, shipped command surface)
- **Depends on**: plans/004-i2c-sensor-driver-library.md **only for**
  `packages/core/src/bytes.ts` (step 1 there). If 004 has not landed, create
  `bytes.ts` exactly as specified in that plan's step 1 as your step 0, and
  say so in your report.
- **Category**: direction
- **Planned at**: commit `321ef7e`, 2026-07-05

## Why this matters

DeviceSDK firmware already speaks UART (`uart_configure` / `uart_write` /
`uart_read` land in both the ESP32 and Pico firmware). Modbus RTU is a thin
framing + CRC16 layer on top of a UART byte stream, which means a pure
TypeScript master in `@devicesdk/core` - **zero firmware changes** - unlocks an
entire class of cheap RS485 hardware: soil moisture probes, SHT20 temp/humidity
transmitters, energy meters (PZEM/Eastron), VFDs, relay boards. Users wire a
~2 EUR auto-direction RS485 transceiver to two GPIO pins and read industrial
sensors from a device script.

## Current state

- `packages/core/src/runtime.ts` - the UART surface on
  `DeviceSenderInterface` (lines 249-267):

  ```ts
  uartConfigure(
      port: number, txPin: number, rxPin: number, baudRate: number,
      dataBits?: 5 | 6 | 7 | 8, stopBits?: 1 | 2, parity?: "none" | "even" | "odd",
  ): Promise<void>;
  uartWrite(port: number, data: string[]): Promise<void>;
  uartRead(port: number, bytesToRead: number, timeoutMs?: number): Promise<DeviceResponse>;
  ```

- `packages/core/src/responses.ts` - the read result (lines 94-101):

  ```ts
  export interface UartReadResult extends BaseResponse {
      type: "uart_read_result";
      payload: { port: number; data: string[]; bytes_read: number };
  }
  ```

  `payload.data` is hex byte strings (`"0x01"`); `bytes_read` may be **less
  than requested** when the read times out (both firmwares return whatever
  arrived: ESP32 `uart_read_bytes` in `firmware/esp32/main/hal.c:758-771`,
  Pico equivalent in `firmware/pico/src/hal.cpp`). The failure case is a
  response with `type: "command_error"`.

- Firmware UART buffers allow up to 4096 bytes per read
  (`MAX_UART_DATA_LEN 4096` in `firmware/esp32/main/command_queue.h:12` and
  `firmware/pico/src/multicore/command_queue.h:11`) - far above the Modbus
  RTU max frame of 256 bytes, so no chunking is needed.

- The server resolves `sendCommandAndWait` responses within a **5 second
  timeout** (`apps/server/src/runtime/deviceSession.ts:402`), so per-request
  UART read timeouts must stay comfortably under 5000 ms (default 1000 ms).

- `packages/core/package.json` `exports` currently maps `"."`, `"./i2c"`,
  `"./devices/pico"`, `"./devices/esp32"`, `"./package.json"`. This plan adds
  a `"./modbus"` subpath following the same shape.

- Tests: vitest, `packages/core/tests/**/*.test.ts`
  (`packages/core/vitest.config.ts`); model new tests after
  `packages/core/tests/i2c/SSD1306.test.ts` (plain describe/it/expect, `.js`
  import extensions).

- Docs guides live in `docs/public/guides/` with YAML frontmatter, e.g.
  `docs/public/guides/using-uart.md`:

  ```yaml
  ---
  title: Using UART
  description: >-
    Serial communication with GPS modules, Bluetooth adapters, and other
    peripherals
  social_image: /og-images/docs/guides/using-uart.png
  ---
  ```

- Repo conventions: strict types (no `any`), zero runtime deps in
  `packages/core`, ESM `.js` import extensions, files under ~700 LOC, no
  em-dashes, no Bun APIs in `packages/*`.

## Commands you will need

| Purpose        | Command                                     | Expected on success |
|----------------|---------------------------------------------|---------------------|
| Install        | `pnpm install`                              | exit 0              |
| Build core     | `pnpm build --filter @devicesdk/core`       | exit 0              |
| Typecheck core | `pnpm check-types --filter @devicesdk/core` | exit 0              |
| Test core      | `pnpm test --filter @devicesdk/core`        | all tests pass      |
| Lint (root)    | `pnpm lint`                                 | exit 0              |

## Scope

**In scope** (the only files you should modify or create):

- `packages/core/src/modbus/crc16.ts` (create)
- `packages/core/src/modbus/ModbusRtuMaster.ts` (create)
- `packages/core/src/modbus/index.ts` (create)
- `packages/core/package.json` (add `"./modbus"` export only)
- `packages/core/tests/modbus/crc16.test.ts` (create)
- `packages/core/tests/modbus/ModbusRtuMaster.test.ts` (create)
- `docs/public/guides/modbus-rtu.md` (create)
- `docs/public/guides/_index.md` (add the new guide to the list **only if**
  the file enumerates guides; read it first - if it is auto-generated or a
  bare index, leave it alone)
- `.changeset/modbus-rtu-master.md` (create)
- Only if plan 004 has not landed: `packages/core/src/bytes.ts`,
  `packages/core/tests/bytes.test.ts`, and the `export * from "./bytes.js";`
  line in `packages/core/src/index.ts` (spec in plan 004 step 1).

**Out of scope** (do NOT touch):

- `firmware/**` - no firmware change; the whole value is riding shipped UART
  commands.
- `apps/server/**`, `packages/cli/**` - `sendCommand`/`uart*` already exist on
  every `DeviceSenderInterface` implementation.
- Modbus TCP / ASCII variants - RTU only.
- RS485 DE/RE direction-pin control - out of scope; the guide documents that
  users need auto-direction transceivers (see maintenance notes).

## Git workflow

- Worktree first: `git worktree add .worktrees/modbus-rtu -b modbus-rtu`
- Commit style: conventional commits, e.g.
  `feat(core): add Modbus RTU master over UART commands`
- Run `pnpm lint` before every commit.
- PR into `main` via `gh pr create --base main` **only if** `origin` is
  `github.com/device-sdk/devicesdk`; otherwise stop and report.

## Steps

### Step 1: CRC16 (Modbus variant)

Create `packages/core/src/modbus/crc16.ts`:

```ts
/**
 * CRC-16/MODBUS: polynomial 0xA001 (reflected 0x8005), init 0xFFFF,
 * no final XOR. Returned as a number 0..0xFFFF; appended to frames
 * low byte first.
 */
export function crc16Modbus(bytes: Uint8Array): number {
    let crc = 0xffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
        }
    }
    return crc;
}
```

Test vectors: `crc16Modbus` of `[0x01, 0x03, 0x00, 0x00, 0x00, 0x0A]` is
`0xCDC5` (wire order low-first: `0xC5, 0xCD`); the CRC of the ASCII bytes of
`"123456789"` is `0x4B37` (the standard CRC-16/MODBUS check value).

**Verify**: `pnpm test --filter @devicesdk/core` → crc16 tests pass.

### Step 2: The master

Create `packages/core/src/modbus/ModbusRtuMaster.ts`. The master wraps the
UART subset of `DeviceSenderInterface` (structural interface, mockable in
tests, same pattern as `I2cBusLike` in plan 004):

```ts
import type { DeviceResponse } from "../responses.js";

export interface ModbusUartLike {
    uartWrite(port: number, data: string[]): Promise<void>;
    uartRead(port: number, bytesToRead: number, timeoutMs?: number): Promise<DeviceResponse>;
}

export interface ModbusRtuMasterOptions {
    port: number;            // UART port already configured via uartConfigure
    responseTimeoutMs?: number; // default 1000; must be < 4000 (server cmd timeout is 5 s)
}

export class ModbusException extends Error {
    constructor(readonly functionCode: number, readonly exceptionCode: number) { ... }
}

export class ModbusRtuMaster {
    constructor(device: ModbusUartLike, options: ModbusRtuMasterOptions) { ... }

    async readCoils(unitId: number, address: number, count: number): Promise<boolean[]>;            // FC 0x01
    async readHoldingRegisters(unitId: number, address: number, count: number): Promise<number[]>;  // FC 0x03
    async readInputRegisters(unitId: number, address: number, count: number): Promise<number[]>;    // FC 0x04
    async writeSingleCoil(unitId: number, address: number, value: boolean): Promise<void>;          // FC 0x05
    async writeSingleRegister(unitId: number, address: number, value: number): Promise<void>;       // FC 0x06
    async writeMultipleRegisters(unitId: number, address: number, values: number[]): Promise<void>; // FC 0x10
}
```

Implementation requirements:

1. **Request framing**: `[unitId, functionCode, ...pdu, crcLo, crcHi]`.
   All addresses/counts/values are 16-bit big-endian in the PDU. Validate
   inputs before sending and throw `Error` with the offending field: unitId
   integer 1..247, address integer 0..0xFFFF, count 1..125 for registers
   (1..2000 for coils), register values integer 0..0xFFFF. Coil write value
   is `0xFF00` (true) / `0x0000` (false).
2. **Transport**: convert with `toHexBytes` from `../bytes.js`, send via
   `uartWrite(port, ...)`, then read via `uartRead`.
3. **Deterministic response lengths** - compute the expected byte count and
   request exactly that:
   - FC 0x01: `5 + Math.ceil(count / 8)`
   - FC 0x03 / 0x04: `5 + 2 * count`
   - FC 0x05 / 0x06 / 0x10: `8` (echo frames)
4. **Exception handling**: a Modbus exception response is 5 bytes
   (`unitId, functionCode | 0x80, exceptionCode, crcLo, crcHi`). Since the
   firmware's `uartRead` returns early only on timeout, read the expected
   full length; if `bytes_read === 5` and byte 1 has the 0x80 bit set,
   CRC-check those 5 bytes and throw `ModbusException` carrying the exception
   code (include the standard meaning in the message: 1 illegal function,
   2 illegal data address, 3 illegal data value, 4 slave device failure).
5. **Validation of normal responses**: check `bytes_read` equals expected
   (else throw a timeout/short-read `Error` including got/expected counts),
   CRC over all bytes except the last two must equal the trailing CRC (throw
   `"Modbus CRC mismatch"` on failure), echo `unitId` and `functionCode` must
   match the request, and byte-count field must match for FC 0x01/0x03/0x04.
6. **Non-result responses**: if `uartRead` resolves with anything other than
   `type: "uart_read_result"`, throw an `Error` naming the response type (and
   `payload.error` for `command_error`).
7. **Serialization**: a single in-flight request per master instance - chain
   calls through an internal promise (`this.queue = this.queue.then(...)`)
   so two concurrent `read*` calls cannot interleave their UART traffic.
8. Keep the file under ~400 LOC; put nothing Bun-specific in it.

Create `packages/core/src/modbus/index.ts` exporting `ModbusRtuMaster`,
`ModbusException`, `crc16Modbus`, and the option/interface types.

**Verify**: `pnpm check-types --filter @devicesdk/core` → exit 0.

### Step 3: Package export

In `packages/core/package.json`, add to `exports` (mirroring `./i2c`):

```json
"./modbus": {
    "types": "./dist/modbus/index.d.ts",
    "import": "./dist/modbus/index.js"
}
```

**Verify**: `pnpm build --filter @devicesdk/core` then
`node -e "import('./packages/core/dist/modbus/index.js').then(m => console.log(Object.keys(m)))"`
→ lists `ModbusRtuMaster`, `ModbusException`, `crc16Modbus`.

### Step 4: Docs guide

Create `docs/public/guides/modbus-rtu.md` with frontmatter matching
`using-uart.md` (title `Modbus RTU over RS485`, a one-line description, and a
`social_image` path following the same `/og-images/docs/guides/<slug>.png`
pattern). Content, concise:

- What it enables (RS485 sensor/meter ecosystems), hardware needed: a UART
  RS485 transceiver **with automatic direction control** (the firmware does
  not drive DE/RE pins) - name the common "XY-017 / auto-flow-control MAX485"
  class of module, wired TX->DI, RX->RO, plus A/B to the bus.
- A complete script example: `uartConfigure(0, txPin, rxPin, 9600)`, build a
  `ModbusRtuMaster(this.env.DEVICE, { port: 0 })`, read holding registers
  from an SHT20-style transmitter (unit 1, FC 0x04, address 1-2, scale /10),
  `emitState` the values.
- A short troubleshooting list: CRC mismatch → swapped A/B; short read →
  wrong baud/parity (many meters use 9600 8N1, some 8E1); ModbusException 2 →
  wrong register address (vendor docs are often 1-based).

First read one full existing guide (`docs/public/guides/using-uart.md`) and
match its heading structure and voice. No em-dashes.

**Verify**: `pnpm lint` → exit 0.

### Step 5: Changeset

Create `.changeset/modbus-rtu-master.md`:

```md
---
'@devicesdk/core': minor
'@devicesdk/website': patch
---

Add `@devicesdk/core/modbus`: a Modbus RTU master (`ModbusRtuMaster`) that
runs over the existing UART commands - read/write coils and registers on
RS485 devices with CRC16 validation and typed Modbus exceptions. New docs
guide: Modbus RTU over RS485.
```

**Verify**: `git status` shows only in-scope files.

## Test plan

All in `packages/core/tests/modbus/`, modeled on
`packages/core/tests/i2c/SSD1306.test.ts`:

- `crc16.test.ts`: the two vectors from step 1, plus empty input → `0xFFFF`.
- `ModbusRtuMaster.test.ts` with a scripted mock `ModbusUartLike` that records
  writes and returns queued canned responses:
  - FC 0x03 happy path: request bytes asserted exactly (including CRC
    `0xC5, 0xCD` for unit 1, addr 0, count 10), canned 25-byte response
    decodes to 10 register values.
  - FC 0x01 coil unpacking (count not a multiple of 8).
  - FC 0x06 echo validated; mismatched echo address throws.
  - Exception response (5 bytes, FC|0x80, code 2) → `ModbusException` with
    `exceptionCode === 2`.
  - CRC-corrupted response → throws with "CRC" in the message.
  - Short read (`bytes_read` < expected) → throws naming got/expected.
  - `command_error` response → throws naming the device error.
  - Concurrency: fire two reads without awaiting; assert the mock saw
    write1/read1/write2/read2 ordering (serialization).
  - Input validation: unitId 0 and 248 throw; count 126 throws for FC 0x03.
- Verification: `pnpm test --filter @devicesdk/core` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check-types --filter @devicesdk/core` exits 0
- [ ] `pnpm build --filter @devicesdk/core` exits 0 and
      `dist/modbus/index.js` exists
- [ ] `pnpm test --filter @devicesdk/core` exits 0, with
      `tests/modbus/crc16.test.ts` and `tests/modbus/ModbusRtuMaster.test.ts`
      present and passing
- [ ] `pnpm lint` exits 0
- [ ] `packages/core/package.json` has the `"./modbus"` export
- [ ] `docs/public/guides/modbus-rtu.md` exists with valid frontmatter
- [ ] `.changeset/modbus-rtu-master.md` exists
- [ ] `git status` shows no files outside the in-scope list
- [ ] `plans/README.md` status row for 005 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `uartRead`/`UartReadResult` signatures no longer match the "Current
  state" excerpts (drift).
- Plan 004 landed but `packages/core/src/bytes.ts` does not exist or exports
  different names than plan 004 step 1 specifies.
- You find an existing Modbus implementation anywhere in the repo
  (`grep -rin modbus packages apps` - run this before step 1; a hit other
  than this plan's files means duplicate work).
- Making the serialization work seems to require changes in
  `apps/server/src/runtime/` - it must not; the master serializes client-side.
- Adding any runtime dependency to `packages/core`.

## Maintenance notes

- The firmware currently cannot drive an RS485 DE/RE direction pin
  synchronously with the UART transmission; if someone later adds
  half-duplex direction control to the firmware, `ModbusRtuMaster` gains
  compatibility with non-auto transceivers for free - keep the transport
  behind `ModbusUartLike`.
- Reviewer scrutiny: big-endian encoding of PDU fields, the exception-frame
  path (easy to CRC-check the wrong slice), and that the concurrency chain
  does not swallow rejections (each caller must still see its own error).
- Deferred: FC 0x02 (discrete inputs) and 0x0F (write multiple coils) - add
  when a user asks; Modbus TCP (different framing, no CRC) - would suit a
  future Ethernet-capable board; a per-request retry option.
