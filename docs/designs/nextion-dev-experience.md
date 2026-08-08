# Nextion Display Development Experience - Investigation

Date: 2026-08-08
Status: Proposal (no code shipped)

## Background

Nextion (ITEAD) displays are UART-TTL HMI panels that run a self-contained
firmware: the user designs screens in the Windows-only Nextion Editor, flashes
the compiled `.tft` file over serial (or microSD), and then talks to the panel
with a proprietary but publicly documented ASCII instruction set. Every
instruction ends in three `0xFF 0xFF 0xFF` bytes. The panel pushes event
frames back over the same UART: touch press/release (`0x65`/`0x67`), data
returns for `get`, and boot strings like `comok 1,30601,...`.

They are one of the most common ESP32/Pico companion peripherals, which makes
the DeviceSDK target audience a natural fit. This document investigates what
the platform can do to make the development experience good.

## Current State

Repo-wide search for `nextion`: zero hits in code, docs, or examples. The
generic UART plumbing exists end to end, so a Nextion can already be driven
from a user script, but with friction:

| Layer | Status |
|-------|--------|
| `uart_configure` / `uart_write` / `uart_read` | ESP32 (`worker_task.c:530`), Pico (`hal.cpp:466`), core types, server sender, simulator (mock), CLI inspect REPL - all present |
| `uart_write` payload | `string[]` of hex bytes, e.g. `["0x41","0x54"]`, capped at 4096 bytes |
| `uart_read` semantics | Pull-based: `{port, bytes_to_read, timeout_ms}` (default 1000 ms); returns `data: string[]` (hex) + `bytes_read` |
| RX buffering | 1024-byte RX buffer on ESP32; no "bytes available" query, no unsolicited RX push |
| Simulator | `uart_configure`/`uart_write` log-only, `uart_read` always returns empty (`useSimulator.ts:286-316`) |
| Display abstraction | `display_update` is I2C SSD1306/SH1106 only; nothing for serial displays |
| Docs | `guides/using-uart.md` covers raw UART; no display-specific guide beyond I2C OLED |

## Pain Points

1. **Hex-string byte arrays for ASCII traffic.** Nextion commands are ASCII
   text (`page 0`, `n0.txt="Hello"`) plus the `0xFF 0xFF 0xFF` terminator.
   Every `uartWrite` call requires hand-encoding text to hex and appending
   terminators - verbose, error-prone, and ~3x the payload size.

2. **Pull-based reads against an async peer.** The panel emits variable-length
   frames asynchronously (touch events, `get` results). The caller must guess
   `bytes_to_read` and poll from a cron, which serializes the command FIFO and
   adds latency. There is no way to ask "how many bytes are buffered?" and no
   event-driven RX path (contrast: `gpio_state_changed` exists). **Decision:
   touch handling must be reactive, not polled.** A script should enable
   monitoring once and then receive events through `onMessage`, mirroring
   `configureGpioInputMonitoring` + `gpio_state_changed`.

3. **Hex-string results need ASCII decoding.** Parsing `comok` or `get` replies
   requires hex-to-ASCII conversion and frame splitting by hand in every
   project.

4. **No shared driver.** Nothing like `SSD1306` exists for serial displays.
   Every user re-implements the instruction set (set text/number, refresh,
   page switching, touch parsing, baud negotiation) in their own script.

5. **Simulator cannot simulate.** `uart_read` returns empty and there is no
   visual representation of the display, so UI logic cannot be iterated
   without hardware. This is the biggest gap for a display-centric workflow:
   the whole point of the simulator is "develop before you solder."

6. **No docs or example.** The I2C OLED path has a guide, a drawing API, and
   the `esp32c3-clock` example. Serial displays have nothing.

## Options

### Phase 1 - no firmware changes (recommended)

**A. Core driver class: `NextionDisplay` in `@devicesdk/core`.** A pure-TS
class (like `SSD1306`) wrapping `DeviceSenderInterface`:

- `connect(port, txPin, rxPin, baud)` - configures UART, wires text/hex
  helpers, `0xFF 0xFF 0xFF` termination.
- `setText(component, value)`, `setNumber(component, value)`, `setVisible`,
  `setColor`, `refresh(component)`, `setPage(page)` - the documented core
  instruction set, ASCII-encoded internally.
- `get(component)` - issues `get`, splits the 3-byte-terminated reply frame,
  decodes the ASCII payload.
- **Reactive touch, no polling:** `startTouchMonitoring()` issues the
  `uart_monitor` command; the script forwards incoming `uart_data` messages
  from `onMessage` to `display.handleIncoming(message)`. The driver buffers
  bytes, splits frames on the `0xFF 0xFF 0xFF` terminator, parses `0x65`
  (press) / `0x67` (release) frames, and invokes `onTouch`-style callbacks
  registered by the script.
- String/hex helpers (`toBytes`, `fromBytes`) exported for advanced use.
- Unit-testable pure TypeScript (no Bun APIs), so it runs in the server
  runtime, the CLI simulator bridge, and the docs.

Scope deliberately: the essentials above, not the whole instruction set or the
TFT upload protocol (upload stays a Nextion-Editor/serial task).

**B. Docs guide + example.** A `guides/using-nextion.md` page (wiring,
baud notes, protocol primer, driver usage, touch handling pattern) and an
`examples/nextion-dashboard` project (or similar) using the driver: UART2 on
ESP32, text + number components updated from the script, touch events
forwarded. Examples are excluded from changesets, so this is low ceremony.

**C. Simulator serial monitor + injector.** In `apps/simulation`, a UART
panel on the stage: hex+ASCII log of every `uart_write`, an `uart_monitor`
ack that emits synthetic `uart_data` events, and an injector that lets the
developer fire "touch press on page P, component N" (plus raw bytes), which
arrive in the script exactly like real touch frames. This makes the reactive
touch path and UI logic testable without hardware. A full virtual Nextion
screen that renders the instruction stream (page changes, text/number/color
updates) is a stretch goal - the instruction set is public and renderable,
but the `.tft` file format is proprietary and only partially
reverse-engineered (UNUF/nxt-doc), so promise never more than instruction
stream rendering, never `.tft` import.

### Phase 2 - firmware + protocol (needs changesets for `@devicesdk/firmware-*`)

**D. `uart_write` string mode.** Accept `data: string` (ASCII, UTF-8 encoded
at the server) alongside the hex array. Cuts payload and user friction ~3x.
Low effort on both firmwares + core + server validation + simulator.

**E. `uart_bytes_available` query (or `bytes_to_read: 0` = drain).** Removes
frame-length guessing for variable-length replies. Low effort.

**F. Event-driven RX push: `uart_monitor` + `uart_data`.** Required for the
reactive touch design (option A depends on it), so it moves into the core
plan alongside A/B/C.

- New command `uart_monitor {port, enable}` on both firmwares. When enabled,
  a background loop (same pattern as the 50 ms GPIO poll that emits
  `gpio_state_changed`) drains the UART RX buffer and pushes unsolicited
  `{type: "uart_data", payload: {port, data: string[]}}` frames to the server.
  Coalesce bytes within a short window (~15 ms) and cap bytes per push to
  avoid flooding the WebSocket; `enable: false` stops and flushes.
- `uart_read` stays for pull use; monitor and read coexist.
- Server: accept `uart_data` in `DeviceMessageSchema` (unsolicited, like
  `gpio_state_changed`); validate the new command in `deviceSender.ts`;
  runtime already routes unsolicited frames to `onMessage`.
- Script side: the driver's `handleIncoming` is the only consumer; the touch
  parser never blocks.
- Generic win: any frame-based serial peripheral (GPS NMEA, AT modems) gets
  the same event path, no Nextion-specific firmware code.

**G. Firmware-side Nextion protocol assist** (stripping terminators, parsing
touch frames in C) - rejected: the protocol is display-side; the generic
string/bytes primitives (D/E/F) cover it better and keep firmware generic.

## Recommendation

Ship **A + B + C + F** as one cohesive effort. F (the `uart_monitor` /
`uart_data` push) is not optional polish - it is what makes touch handling
reactive instead of polled, and option A's driver is designed around it.
Together they cover the development workflow: script-side protocol handled by
a tested shared driver, reactive touch events through `onMessage`, guidance in
docs, and a simulator that injects touch frames so UI logic is iterable before
hardware arrives. The firmware work rides existing release machinery
(changesets for `@devicesdk/firmware-*`).

Phase 2 leftovers (D/E - string-mode `uart_write` payloads and an
`uart_bytes_available` drain query) are cheap and high value for all serial
peripherals, not just Nextion - pick them up opportunistically when firmware
changes next land.

## Risks

- Nextion firmware versions vary; the instruction set is stable but
  `comok` fields differ across editor versions. The driver should treat boot
  strings as informational, not parse strictly.
- `uart_data` push must be rate-capped so a chatty peripheral cannot flood the
  WebSocket; the coalescing window and per-push byte cap are the backpressure
  mechanism.
- The simulator cannot render real `.tft` designs (proprietary format). Set
  expectations in docs.
- Community JS drivers exist (MIT) but target Node serialport; our driver
  targets the DeviceSDK script runtime, so it must be written fresh against
  the official instruction set, using those only as reference.
