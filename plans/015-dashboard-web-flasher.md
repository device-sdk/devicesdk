# Plan 015: Flash devices from the dashboard - WebSerial ESP32 flashing + UF2 download

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e6d6454..HEAD -- apps/dashboard/src/ apps/dashboard/package.json apps/server/src/endpoints/devices/downloadFirmware.ts docs/public/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (browser hardware API; but zero server/firmware changes, and a
  failed flash is recoverable by re-flashing)
- **Depends on**: none. Interacts with plan 008 (TLS by default): once 008
  lands the dashboard is HTTPS, which makes WebSerial's secure-context
  requirement satisfied on LAN installs; nothing in this plan changes for 008
  because all image patching stays server-side.
- **Category**: direction
- **Planned at**: commit `e6d6454`, 2026-07-06

## Why this matters

The single hardest step of DeviceSDK onboarding is the only one that requires
a Python toolchain: `devicesdk flash` refuses to run without a pip-installed
`esptool.py`. Yet the server already does all the hard work - the firmware
download endpoint streams a fully patched, checksum-corrected, ready-to-flash
image. The dashboard currently has NO firmware download at all (the onboarding
wizard just tells users to install the CLI). This plan adds a "Flash firmware"
flow to the device page: ESP32 boards flash directly from the browser over
WebSerial (the ESPHome web-installer model), Pico boards get a one-click
patched UF2 download with BOOTSEL instructions. Result: a user can go from
zero to a connected device with only a browser and a USB cable.

## Current state

Relevant files:

- `apps/server/src/endpoints/devices/downloadFirmware.ts` - **do not modify.**
  `POST /v1/projects/:projectId/devices/:deviceId/firmware` with JSON body
  `{ ssid?, pass?, host?, device_type }` where `device_type` is
  `"pico-w" | "pico2-w" | "esp32" | "esp32c61" | "esp32c3"` (Zod enum, lines
  44-58). Behavior you must surface in the UI:
  - `host` defaults to the host that served the request (line 79); an
    explicit value overrides.
  - `ssid` max 32 bytes, `pass` max 63 bytes (Zod + `padAsciiToLength`).
  - **Token rotation side effect** (lines 113-130): every download deletes the
    device's managed token and mints a fresh one, so a currently-connected
    device will be rejected on reconnect until reflashed. The dialog must warn
    about this before downloading.
  - Success → `200` with `Content-Type: application/octet-stream` and the
    patched bytes; ESP32 images get their checksum recalculated (line 203),
    UF2 gets structure-validated (line 214).
  - Unpublished firmware → `404` with JSON
    `{ success: false, code: "FIRMWARE_NOT_PUBLISHED", device_type }` (lines
    169-177) - the dialog must show a friendly message for this case.
- `packages/cli/src/flash/esp32.ts` - reference only. The CLI flashes with
  `esptool --chip <name> --baud 460800 ... write_flash 0x0 <bin>` (lines
  144-156, `DEFAULT_BAUD = 460800` at line 14). Two facts matter: the
  published ESP32 binary is a **merged image flashed at offset 0x0**, and the
  chip name comes from the device type (`esp32` → `esp32`, `esp32c3` →
  `esp32c3`, `esp32c61` → `esp32c61`; see `getEsp32ChipName` in
  `packages/cli/src/commands/flash.ts`).
- `packages/cli/src/commands/flash.ts` - reference only. Post-flash success
  copy worth reusing (line ~168): "LED status sequence after reboot: 1 blink =
  booted, then 2 blinks = Wi-Fi connected, then 3 blinks = cloud connected."
  Pico flow: put device in BOOTSEL mode, appears as volume "RPI-RP2" or
  "RP2350", copy the .uf2 onto it.
- `apps/dashboard/src/lib/api.ts` - fetch wrapper: `call<T>` sends
  `credentials: 'include'` (session cookie) and JSON headers, throws
  `ApiError` with `status` / `isNetworkError`. It always parses JSON, so the
  binary firmware download needs a small parallel helper (step 2) - do not
  bend `call<T>` to return ArrayBuffers.
- `apps/dashboard/src/services/api.service.ts` - service layer; add
  `firmwareService` here.
- `apps/dashboard/src/pages/DeviceDetailsPage.vue` - tab strip at lines 57-62;
  the `overview` tab panel starts at line 68. The Flash button goes on the
  overview panel.
- `apps/dashboard/tests/unit/CreateDeviceDialog.spec.ts` - the exemplar for
  dialog component tests (vitest + Quasar).
- `apps/dashboard/package.json` - dependencies include `echarts`, `quasar`,
  `vue` etc. `esptool-js` gets added here.
- `apps/dashboard/src/components/OnboardingWizard.vue` - mentions "Flash
  firmware" as a CLI step (line 198). Out of scope to rework, but see
  maintenance notes.

Devices do NOT store a board type server-side (`tableDevices` in
`apps/server/src/types.d.ts:66-77` has no `device_type` column) - the user
picks the board in the dialog every time, exactly like the CLI reads it from
local config.

Browser constraints (design inputs, verify at runtime not build time):

- WebSerial exists only in Chromium-based browsers and only in a **secure
  context** (HTTPS or `http://localhost`). A LAN dashboard on
  `http://192.168.x.x:8080` today is NOT a secure context, so the flow must
  feature-detect (`'serial' in navigator && window.isSecureContext`) and fall
  back to a "download + CLI instructions" panel. After plan 008 (TLS) lands,
  LAN installs become secure contexts and the full flow lights up.
- `navigator.serial.requestPort()` must be called from a user-gesture handler
  (a button click - not from `onMounted` or a promise chain detached from the
  click).

Repo conventions that apply:

- Strict types, no `any`; Vue 3 `<script setup lang="ts">` + Quasar components
  (match `CreateDeviceDialog.vue`'s idiom).
- No em-dashes in any text (use " - ").
- Files under ~700 LOC - keep the esptool driver logic in a separate
  `lib/` module, not inside the dialog component.

## Commands you will need

| Purpose | Command (repo root) | Expected on success |
|---------|---------------------|---------------------|
| Add dependency | `pnpm add esptool-js --filter @devicesdk/dashboard` | package.json + lockfile updated |
| Install | `pnpm install` | exit 0 |
| Dashboard lint | `pnpm lint --filter @devicesdk/dashboard` | exit 0 |
| Dashboard unit tests | `pnpm test:unit --filter @devicesdk/dashboard` | all pass |
| Full build | `pnpm build` | exit 0 |
| Dev servers (manual check) | `pnpm local` | server :8080 + dashboard :9000 |
| Changeset | `pnpm changeset` | see step 7 |
| Root lint (pre-commit) | `pnpm lint` | exit 0 |

## Scope

**In scope** (the only files you should modify or create):

- `apps/dashboard/package.json` + `pnpm-lock.yaml` (esptool-js dependency)
- `apps/dashboard/src/services/api.service.ts` (add `firmwareService`)
- `apps/dashboard/src/lib/webFlash.ts` (create - esptool-js driver wrapper)
- `apps/dashboard/src/components/FlashDeviceDialog.vue` (create)
- `apps/dashboard/src/pages/DeviceDetailsPage.vue` (add the Flash button)
- `apps/dashboard/tests/unit/FlashDeviceDialog.spec.ts` (create)
- `docs/public/` - the one page that documents flashing (step 8 locates it)
- `.changeset/*.md` (dashboard minor + website patch)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):

- `apps/server/**` - no server changes; the download endpoint already does
  everything needed. In particular do not add a GET variant of the firmware
  endpoint or weaken its auth.
- `packages/cli/**` and `firmware/**` - the CLI flash path stays the
  authoritative fallback; firmware placeholders are plan 007/008 territory.
- `OnboardingWizard.vue` - reworking onboarding around the web flasher is a
  follow-up, not this plan.
- Playwright E2E (`apps/dashboard/tests/e2e/`) - hardware flows cannot run in
  CI; unit tests only.

## Git workflow

- Worktree off `main`:
  `git worktree add .worktrees/015-dashboard-web-flasher -b 015-dashboard-web-flasher`
- Conventional commits, e.g.
  `feat(dashboard): flash ESP32 firmware from the browser via WebSerial`.
- `pnpm lint` before every commit.
- Open a PR into `main` only if `origin` points at
  `github.com/device-sdk/devicesdk`; otherwise report and ask (repo rule).

## Steps

### Step 1: Add esptool-js

`pnpm add esptool-js --filter @devicesdk/dashboard` (esptool-js is Espressif's
official browser flasher library, MIT, pure browser - it is the engine behind
ESPHome's web installer). Record the installed version in your report.

**Read its README/examples now** (`node_modules/esptool-js/README.md` and the
`examples/typescript` directory if present). The API sketch in step 3 reflects
the 0.4/0.5-era API (`ESPLoader`, `Transport`, `loader.main()`,
`loader.writeFlash({ fileArray, ... })`). If the installed version's README
shows a materially different surface, **follow the README's official example**
for connect/detect/write/reset and keep this plan's UX and gating unchanged.

**Verify**: `grep esptool-js apps/dashboard/package.json` → one dependency
line; `pnpm build` → exit 0 (nothing imports it yet).

### Step 2: Binary download in the service layer

In `apps/dashboard/src/services/api.service.ts` add:

```ts
export type FlashDeviceType = 'pico-w' | 'pico2-w' | 'esp32' | 'esp32c61' | 'esp32c3';

export interface FirmwareRequest {
  ssid?: string;
  pass?: string;
  host?: string;
  device_type: FlashDeviceType;
}

export const firmwareService = {
  /** Downloads a patched, ready-to-flash image. WARNING (server behavior):
   *  every call rotates the device's auth token - a currently-connected
   *  device is rejected on reconnect until reflashed with this image. */
  async download(projectId: string, deviceId: string, body: FirmwareRequest): Promise<ArrayBuffer> { ... },
};
```

Implement with raw `fetch` (not `call<T>`, which JSON-parses everything):
POST to `${API_HOST}/v1/projects/${projectId}/devices/${deviceId}/firmware`
with `credentials: 'include'`, JSON body. Import `API_HOST` the same way
`lib/api.ts` does (`@/config/apiHost`). On `!response.ok`, attempt
`response.json()` and throw an `ApiError` (imported from `@/lib/api` if
exported; otherwise a plain `Error`) carrying the server's `error` string and,
when present, the `code` field so the dialog can special-case
`FIRMWARE_NOT_PUBLISHED`. On success return `response.arrayBuffer()`.

**Verify**: `pnpm lint --filter @devicesdk/dashboard` → exit 0.

### Step 3: `lib/webFlash.ts` - the esptool-js driver

Create `apps/dashboard/src/lib/webFlash.ts`. Everything esptool-js lives here
behind a **dynamic import** so the (large) library is a lazy chunk that only
loads when a user actually flashes:

```ts
export function webSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator && window.isSecureContext;
}

export interface FlashProgress { stage: 'connecting' | 'erasing' | 'writing' | 'resetting'; percent: number; }

export interface FlashCallbacks {
  onProgress(p: FlashProgress): void;
  onLog(line: string): void; // esptool terminal output, shown in a collapsible log
}

/** Chip family expected per selected device_type; used to abort on mismatch. */
export const CHIP_MATCH: Record<'esp32' | 'esp32c3' | 'esp32c61', string> = {
  esp32: 'ESP32',       // detected name contains this AND no '-' suffix family conflict
  esp32c3: 'ESP32-C3',
  esp32c61: 'ESP32-C61',
};

export async function flashEsp32(
  firmware: ArrayBuffer,
  deviceType: 'esp32' | 'esp32c3' | 'esp32c61',
  cb: FlashCallbacks,
): Promise<void> { ... }
```

`flashEsp32` outline (adjust to the installed version's README per step 1):

1. `const { ESPLoader, Transport } = await import('esptool-js');`
2. `const port = await navigator.serial.requestPort();` (caller guarantees
   user gesture; surface "no port selected" cancellation as a non-error).
3. `const transport = new Transport(port);` and
   `const loader = new ESPLoader({ transport, baudrate: 460800, terminal: {...} })`
   - wire the terminal callbacks to `cb.onLog`; 460800 matches the CLI's
   `DEFAULT_BAUD`.
4. `const chip = await loader.main();` → detected chip name string. Compare
   against `CHIP_MATCH[deviceType]` case-insensitively: on mismatch, throw
   `Error("Connected board reports '<chip>' but you selected '<deviceType>'.")`
   Special case: plain `esp32` must NOT match `ESP32-C3`/`ESP32-S3`/etc. -
   require the detected name to be exactly the family (strip whitespace,
   compare the token before any revision suffix).
5. Convert the ArrayBuffer to the binary string esptool-js expects - chunked,
   never `String.fromCharCode(...spread)` on megabyte arrays:

```ts
function toBinaryString(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return out;
}
```

6. `await loader.writeFlash({ fileArray: [{ data: bin, address: 0x0 }], flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep', eraseAll: false, compress: true, reportProgress: (i, written, total) => cb.onProgress({ stage: 'writing', percent: Math.round((written / total) * 100) }) });`
   Address `0x0` because the published binary is a merged image (the CLI does
   `write_flash 0x0`).
7. Hard-reset the board (per the installed version: `loader.after('hard_reset')`
   or `transport.setDTR/setRTS` sequence from the README example), then
   `await transport.disconnect();` in a `finally` block so a failed flash
   releases the port.

**Verify**: `pnpm build` → exit 0, and the build output contains a separate
lazy chunk for esptool-js:
`ls apps/dashboard/dist/spa/assets/ | grep -i esptool` → at least one file.
(If Vite named the chunk differently, verify laziness instead with:
`grep -L "ESPLoader" apps/dashboard/dist/spa/assets/index*.js` → the main
entry does not contain it.)

### Step 4: `FlashDeviceDialog.vue`

Create `apps/dashboard/src/components/FlashDeviceDialog.vue`, modeled
structurally on `CreateDeviceDialog.vue` (QDialog, `v-model`, emits). Props:
`projectId`, `deviceId`, `deviceName`.

Form fields:

- Board type: QSelect with the five `FlashDeviceType` values, grouped labels
  ("ESP32", "ESP32-C3", "ESP32-C61", "Pico W", "Pico 2 W"). Required.
- Wi-Fi SSID: QInput, `maxlength="32"`.
- Wi-Fi password: QInput type password, `maxlength="63"`.
- Server host: QInput, default `window.location.host`, with hint "The address
  your device will connect back to - change it if this page's address is not
  reachable from the device's network."

Static warning (always visible, before any action): "Downloading firmware
rotates this device's access token. If this device is currently connected,
it will be rejected on its next reconnect until you flash it with this new
image." (This mirrors the server behavior in `downloadFirmware.ts:113-130`.)

Action area, three cases:

1. **Pico types** (`pico-w`, `pico2-w`): button "Download UF2". Calls
   `firmwareService.download`, wraps the ArrayBuffer in a Blob
   (`application/octet-stream`), triggers a browser download named
   `devicesdk-client.uf2` (create object URL + click a temp anchor + revoke).
   Then show the BOOTSEL steps: hold BOOTSEL while plugging in USB, the board
   mounts as "RPI-RP2" (Pico W) or "RP2350" (Pico 2 W), copy the file onto the
   volume, board reboots. LED sequence copy: "1 blink = booted, 2 blinks =
   Wi-Fi connected, 3 blinks = cloud connected."
2. **ESP32 types with `webSerialSupported()`**: primary button "Connect &
   Flash". In the click handler (user gesture!): download the firmware, then
   `flashEsp32(...)` with a progress bar (QLinearProgress) bound to
   `FlashProgress`, plus a collapsible (QExpansionItem) monospace log fed by
   `onLog`. Success panel: the LED sequence copy above + "the device will
   appear as Connected here once it comes online." Errors: show the message
   inline (QBanner negative); "no port selected" cancellation resets silently.
3. **ESP32 types without WebSerial support**: info banner explaining why
   ("Browser flashing needs Chrome/Edge and a secure (HTTPS or localhost)
   connection"), a "Download .bin" button (same blob-download flow, filename
   `<device_type>-client.bin`), and the CLI fallback snippet in a copyable
   code block:
   `esptool.py --chip <chip> --baud 460800 write_flash 0x0 <file>.bin`
   plus "or run: devicesdk flash <deviceId>".

Special-case `FIRMWARE_NOT_PUBLISHED` errors from the service with: "Firmware
for this board is not published on this server yet - see the firmware build
docs." Wire the dialog into `DeviceDetailsPage.vue`'s overview tab panel
(starts line 68): a QBtn "Flash firmware" (icon `memory` or `usb`) that opens
the dialog. Keep the change additive - do not restructure the overview panel.

**Verify**: `pnpm build` → exit 0. Manual check if the environment allows:
`pnpm local`, open a device page → overview shows the button; the dialog on
`http://localhost:9000` (secure context) with an ESP32 type selected shows
"Connect & Flash"; with Pico selected shows "Download UF2". Report if manual
verification was not possible.

### Step 5: Unit tests

`apps/dashboard/tests/unit/FlashDeviceDialog.spec.ts`, modeled on
`CreateDeviceDialog.spec.ts` (mount pattern, Quasar plugin setup). Mock
`@/services/api.service` (`firmwareService.download`) and `@/lib/webFlash`
(`webSerialSupported`, `flashEsp32`). Cases:

1. Pico type selected → "Download UF2" visible, no WebSerial UI.
2. ESP32 selected + `webSerialSupported() === true` → "Connect & Flash"
   visible.
3. ESP32 selected + `webSerialSupported() === false` → fallback banner +
   "Download .bin" + CLI snippet visible.
4. Token-rotation warning is always rendered.
5. Download failure with code `FIRMWARE_NOT_PUBLISHED` → the friendly
   unpublished-firmware message renders.

Also add 2-3 pure tests for `toBinaryString` (export it from `webFlash.ts`):
empty buffer, <32KB buffer, >32KB buffer round-trip
(`out.charCodeAt(i) === bytes[i]` spot checks). Put them in the same spec file
or `tests/unit/webFlash.spec.ts`.

**Verify**: `pnpm test:unit --filter @devicesdk/dashboard` → all pass,
including the new spec(s).

### Step 6: Docs

Find the flashing doc: `grep -rln "esptool" docs/public/` (expect a hit in
`docs/public/first-device.md` or under `docs/public/hardware/`). In the page
that walks through flashing, add a short subsection "Flash from the dashboard"
(3-6 sentences): open the device page → Flash firmware → for ESP32 use
Chrome/Edge over HTTPS or localhost and flash over USB directly; for Pico
download the UF2 and copy it in BOOTSEL mode; the CLI remains available for
scripted/multi-device flashing. Match the page's existing heading level and
tone.

**Verify**: `grep -rn "Flash from the dashboard" docs/public/` → one hit.

### Step 7: Changesets

- `@devicesdk/dashboard`: minor - "Flash devices from the dashboard: ESP32
  browser flashing over WebSerial (Chromium + secure context) and one-click
  patched UF2 download for Pico, with CLI fallback instructions."
- `@devicesdk/website`: patch - "Docs: flash-from-dashboard instructions."
  (Docs-only changes under docs/public are covered by a website changeset -
  repo rule.)

**Verify**: `ls .changeset/*.md` shows both files.

## Test plan

Covered in step 5. Summary: 5 dialog-gating cases + `toBinaryString` unit
tests; regression gate `pnpm test:unit --filter @devicesdk/dashboard` and
`pnpm build`. No Playwright (hardware flow, explicitly out of scope). Real
hardware validation (actual ESP32 over USB) is an **owner step** before
release - state this in your completion report.

## Done criteria

ALL must hold:

- [ ] `pnpm build` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test:unit --filter @devicesdk/dashboard` exits 0 including the new
      spec file(s)
- [ ] esptool-js is NOT in the dashboard's main entry chunk (step 3
      verification - lazy chunk exists or main entry lacks `ESPLoader`)
- [ ] `grep -rn "isSecureContext" apps/dashboard/src/lib/webFlash.ts` → hit
      (the gate exists)
- [ ] The dialog renders the token-rotation warning unconditionally (unit
      test 4 passes)
- [ ] `git status` shows no modified files outside the in-scope list (no
      server, CLI, or firmware changes)
- [ ] Two changeset files exist (dashboard minor, website patch)
- [ ] `plans/README.md` status row for 015 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The installed esptool-js README shows no ESPLoader/Transport-style API at
  all, or flashing requires assets the library does not bundle (e.g. external
  stub JSON fetched from a CDN - the dashboard is same-origin only). Report
  with the version and README excerpt.
- `downloadFirmware.ts` no longer matches the "Current state" description
  (body schema, token rotation, or patched-image behavior changed - plan 008
  may have landed and altered the flow).
- The fix appears to require ANY server-side change (new endpoint, CORS
  header, auth tweak). That is out of scope by design - report instead.
- Quasar/Vite cannot code-split the dynamic import (esptool-js lands in the
  main chunk and adds more than ~200 KB gzipped to it) and you cannot fix it
  with a standard `/* @vite-ignore */`-free dynamic import - report with
  numbers.
- `CreateDeviceDialog.spec.ts` mounting pattern does not work for the new
  dialog after two fix attempts.

## Maintenance notes

- **Plan 008 (TLS by default)**: after it lands, LAN dashboards are HTTPS, so
  the WebSerial path lights up outside localhost. No code change expected
  here; retest the flow once 008 ships. If 008 also changes the firmware
  download flow (it patches a cert into images server-side), this dialog is
  unaffected as long as the endpoint contract stays `POST body → patched
  bytes`.
- **Plan 010 (OTA)**: once OTA exists, USB flashing becomes first-boot-only -
  worth then promoting this dialog into the onboarding wizard and
  `CreateDeviceDialog` success step (explicitly deferred from this plan).
- **New boards** (ESP32-S3, etc.): extend both the `FlashDeviceType` union in
  the service layer and `CHIP_MATCH` in `webFlash.ts`; the chip-mismatch guard
  is what prevents flashing an S3 image onto a C3.
- Reviewer should scrutinize: the chip-family match logic (step 3.4 - plain
  `esp32` must not match `ESP32-C3`), the `finally`-block port release, and
  that `requestPort()` stays inside the click handler (moving it into an
  awaited helper called from the handler is fine; detaching it from the
  gesture is not).
- Deferred: flashing from the onboarding wizard; remembering the last-used
  board type per device (needs a server-side column - coordinate with the
  schema if ever added); Firefox/Safari support (blocked on the platforms
  themselves).
