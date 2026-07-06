# Plan 010: OTA firmware updates for ESP32 (server push, A/B partitions, rollback-safe)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat bbd724d..HEAD -- apps/server/src/endpoints/devices apps/server/src/foundation apps/server/migrations apps/server/src/janitor.ts firmware/esp32 packages/cli/src`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. In particular, if plan 007 (MQTT) or
> plan 008 (TLS) has already landed, the firmware connection path and the
> download-host semantics have changed - STOP and get the plan re-baselined.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED-HIGH (firmware update path; mitigated by ESP-IDF rollback)
- **Depends on**: none hard. **Coordinate with plan 008 (TLS)**: both force a
  one-time USB reflash of every device; landing them in the same firmware
  release means users reflash once, not twice. If 008 landed first, the OTA
  HTTP fetch in Phase 2 must use TLS with the pinned cert (see STOP
  conditions).
- **Category**: direction
- **Planned at**: commit `bbd724d`, 2026-07-06

## Why this matters

Today every firmware change requires physical USB access to every device
(ROADMAP.md: "OTA updates: let the server push firmware updates to connected
devices (today: re-flash over USB)"). Two pending plans (007 MQTT transport,
008 TLS) both ship firmware changes, so the fleet-reflash pain is about to be
paid twice. After this plan, the server can push a new patched firmware image
to a connected ESP32 over the LAN: the device downloads it into the inactive
OTA slot, verifies it, reboots into it, and automatically rolls back if the
new image fails to reach a healthy state. Pico is explicitly deferred (no
first-party A/B story in pico-sdk).

## Current state

### Server

- `apps/server/src/endpoints/devices/downloadFirmware.ts` - the existing
  flash-time image builder. Reads the prebuilt binary from `c.env.FIRMWARES`
  (an `FsBlobStore`, keys like `esp32-client.bin`), patches six fixed-length
  ASCII placeholder regions (Wi-Fi SSID/pass, API token, host, project id,
  device id - placeholder constants `OLD_TOKEN`, `OLD_SSID`, `OLD_PASS`,
  `OLD_HOST`, `OLD_PROJECT_ID`, `OLD_DEVICE_ID` at lines 15-21), recalculates
  the ESP-IDF image checksum via
  `recalculateEsp32Checksum` (`apps/server/src/foundation/esp32ImageChecksum.ts`),
  and streams the result. **Critical fact**: it deletes the device's managed
  token and creates a fresh one on EVERY download (lines 113-148) because only
  the token's hash is stored - the old raw token can never be re-embedded.
- `apps/server/src/foundation/deviceReboot.ts` - exemplar for server-initiated
  device commands: `getDeviceStub(env, projectId, deviceId)` (from
  `foundation/deviceHandle.ts`) then `stub.triggerRebootForDeploy()`, a method
  on the in-process `DeviceSession`
  (`apps/server/src/runtime/deviceSession.ts`, 815 lines).
- `apps/server/src/janitor.ts` - hourly cleanup (expired sessions/CLI codes,
  old logs/usage). New OTA-artifact expiry hooks in here.
- `apps/server/migrations/` - sequential SQL files; add the next number.
- Auth: `apps/server/src/foundation/auth.ts` resolves Bearer/API tokens;
  device WebSocket routes live in
  `apps/server/src/endpoints/devices/wsRoutes.ts`.
- Endpoint pattern: Hono + Chanfana + Zod, `BaseRoute` subclass, registered in
  `apps/server/src/endpoints/devices/router.ts`. Responses
  `{ success: true, result }` / `{ success: false, error }`.

### Firmware (ESP32)

- `firmware/esp32/partitions.csv` - current table is factory-only and exactly
  fills 2 MB:

  ```
  nvs,      data, nvs,     0x9000,  0x6000,
  phy_init, data, phy,     0xf000,  0x1000,
  factory,  app,  factory, 0x10000, 0x1F0000,
  ```

- `firmware/esp32/sdkconfig.defaults` - no explicit flash-size setting (IDF
  default applies); `CONFIG_WS_BUFFER_SIZE=2048` (WS frames >2 KB are dropped,
  which is why the OTA image must NOT travel over the WebSocket).
- Device→server protocol: JSON frames `{type, id, payload}` parsed in
  `firmware/esp32/main/websocket_handler.c` (`handle_websocket_message`,
  line 68; e.g. `if (strcmp(type, "reboot") == 0)` at line 102 maps to
  `CMD_REBOOT`). Long-running work must NOT run on the worker task's
  command/response queue - the reboot pattern (respond first, act in the main
  task, `firmware/esp32/main/devicesdk_main.c:265-292`) is the model.
- Targets: `esp32`, `esp32c3` (`sdkconfig.defaults.esp32c3`), `esp32c61`
  (`sdkconfig.defaults.esp32c61`). Binaries ship via GitHub Releases and are
  bundled into the Docker image; a firmware version bump ONLY happens when a
  changeset for `@devicesdk/firmware-esp32` exists (repo rule: no changeset =
  won't ship).

### CLI

- `packages/cli/src/flash/esp32.ts` + `packages/cli/src/commands/` - the flash
  flow: fetches the patched image from the server
  (`POST .../firmware/download` with `ssid`, `pass`, `host`, `device_type`)
  and writes it over USB. The OTA command reuses the same request surface
  minus the USB step.

### Conventions

Strict TS, no `any`; Zod at boundaries; migrations are plain sequential SQL
(never run migration SQL through workers-qb - see TROUBLESHOOT.md); IDs
`crypto.randomUUID()`; timestamps `Date.now()`; files under ~700 LOC;
firmware changesets mandatory.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Server tests | `pnpm test --filter @devicesdk/server` | all pass |
| Server types | `pnpm check-types --filter @devicesdk/server` | exit 0 |
| CLI tests | `pnpm test --filter @devicesdk/cli` | all pass |
| Lint (pre-commit) | `pnpm lint` | exit 0 |
| ESP32 build (if `idf.py` installed) | `cd firmware/esp32 && idf.py build` | build succeeds; skip gracefully if toolchain absent (repo convention) |
| Regen OpenAPI | `cd apps/server && bun run scripts/generate-openapi.ts` | openapi.json updated |

Firmware CI builds run in GitHub Actions (`firmware-esp32.yml`) on
`[self-hosted, linux, proxmox-ephemeral]` runners - if the local toolchain is
missing, CI is the build gate.

## Scope

**In scope**:

- `apps/server/src/endpoints/devices/` - new `pushOtaUpdate.ts` (POST) and
  `downloadOtaImage.ts` (device GET), registered in `router.ts`
- `apps/server/migrations/<next>_ota_updates.sql`
- `apps/server/src/foundation/deviceOta.ts` (new; mirrors `deviceReboot.ts`)
- `apps/server/src/runtime/deviceSession.ts` - one new stub method to emit the
  `ota_update` frame + the "finalize on reconnect" hook
- `apps/server/src/endpoints/devices/wsRoutes.ts` +
  `apps/server/src/foundation/auth.ts` - ONLY to thread the authenticated
  token id to the device-connect path (see Step 4)
- `apps/server/src/janitor.ts` - expire stale OTA artifacts
- `firmware/esp32/`: `partitions.csv` (or a new `partitions_ota.csv` +
  sdkconfig pointer), `sdkconfig.defaults*`, new `main/ota_handler.c/.h`,
  `main/websocket_handler.c` (new frame type), `main/devicesdk_main.c`
  (mark-valid hook + OTA task kick), `main/CMakeLists.txt`
- `packages/cli/src/commands/` - new `ota` command wired in
  `packages/cli/src/index.ts`
- `apps/server/openapi.json` (regenerated), `ROADMAP.md`, `README.md`
  (firmware section), `.changeset/*` (server + cli + firmware-esp32),
  `plans/README.md`

**Out of scope** (do NOT touch):

- `firmware/pico/` - Pico OTA is explicitly deferred; do not "fix it too".
- `downloadFirmware.ts` behavior for USB flashing - it keeps rotating tokens
  on every download; do not change its semantics.
- Dashboard UI for OTA - CLI-only in v1.
- Any firmware-version negotiation / auto-update policy - v1 is
  user-initiated push of the server's currently bundled firmware.
- `packages/core` - no user-script-visible API changes.

## Git workflow

- `git worktree add .worktrees/ota-esp32 -b ota-esp32`; work only there.
- Conventional commits (`feat(server): ...`, `feat(firmware-esp32): ...`,
  `feat(cli): ...`); `pnpm lint` before every commit.
- Changesets: `@devicesdk/server` (minor), `@devicesdk/cli` (minor),
  `@devicesdk/firmware-esp32` (minor - REQUIRED or firmware won't ship).
- PR into `main` only if `origin` is `github.com/device-sdk/devicesdk`.
- **The PR must not be merged before the owner hardware-validates OTA on a
  real ESP32** (same convention as plan 006). Say so in the PR description.

## Design (decided - do not re-litigate)

1. **Transport**: the image travels over **HTTP GET**, never the WebSocket
   (ESP32 WS buffer is 2 KB). The server only sends a small WS control frame:

   ```json
   { "type": "ota_update", "id": "<uuid>",
     "payload": { "path": "/v1/ota/<artifactId>", "size": 123456,
                  "sha256": "<hex>" } }
   ```

   The device builds the full URL from its own configured host (the same
   host:port it uses for the WS) + `path` - this avoids host-mismatch bugs
   when the CLI reaches the server by a different address than the device.
2. **Artifact**: `POST /v1/projects/:projectId/devices/:deviceId/ota` builds
   the patched image immediately (same placeholder patching + checksum
   recalculation as `downloadFirmware.ts`), stores the bytes via
   `c.env.FIRMWARES.put("ota/<artifactId>.bin", ...)`, records a row in a new
   `ota_updates` table, then pushes the WS frame. Request body: `ssid`,
   `pass`, `host?`, `device_type` (same Zod shapes as `downloadFirmware.ts`) -
   Wi-Fi credentials are compile-time-patched into the image, and the server
   never stores them, so the caller must supply them again.
3. **Token lifecycle (the bricking hazard)**: `downloadFirmware.ts` deletes
   the old managed token when creating the new one. OTA MUST NOT do that - if
   the device fails to apply the image, its old token must keep working.
   Instead:
   - The OTA endpoint creates the new managed token with description
     `"<deviceId> authentication token (ota-pending)"` and stores
     `new_token_id` + `old_token_id` on the `ota_updates` row.
   - When a device WS connection authenticates with the pending token
     (Step 4), the server "finalizes": deletes the old token row, renames the
     new token's description to the standard
     `"<deviceId> authentication token"`, deletes the artifact blob, marks
     the row `completed`.
   - The janitor expires rows older than 24 h that never finalized: delete
     the artifact blob AND the pending new token (the device evidently still
     runs the old image, whose token was never touched).
4. **Device apply path** (ESP32): on `ota_update`, ack the frame, then spawn a
   dedicated FreeRTOS task that runs `esp_https_ota` against the URL with the
   device's API token in the `Authorization: Bearer` header, verifies the
   sha256 while streaming, sets the boot partition, and reboots.
   `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y`: the new image boots in
   pending-verify state and calls `esp_ota_mark_app_valid_cancel_rollback()`
   only AFTER the WebSocket connects and authenticates; any earlier crash or
   auth failure causes the bootloader to fall back to the previous slot.
5. **Partition table**: dual OTA slots require 4 MB flash:

   ```
   nvs,      data, nvs,     0x9000,   0x6000,
   otadata,  data, ota,     0xf000,   0x2000,
   phy_init, data, phy,     0x11000,  0x1000,
   ota_0,    app,  ota_0,   0x20000,  0x1E0000,
   ota_1,    app,  ota_1,   0x200000, 0x1E0000,
   ```

   plus `CONFIG_ESPTOOLPY_FLASHSIZE_4MB=y`. This is a breaking layout change:
   already-flashed devices need one final USB reflash (coordinate with plan
   008, which breaks flash compatibility anyway - owner accepted that class of
   break; see memory of scope decision 008).

## Steps

### Phase 0 - Spike (verify feasibility before touching anything)

1. Determine the current ESP32 app size: download the latest
   `firmware-esp32@v*` release asset `esp32-client.bin` (or build locally) and
   check `size <= 0x1E0000` (1,966,080 bytes). Record the number in the PR.
2. Confirm `esp_https_ota` + plain-HTTP is available for the pinned ESP-IDF
   version used by `firmware/esp32` (check `idf_component.yml` /
   `dependencies.lock`): the config knobs are `CONFIG_ESP_HTTPS_OTA_ALLOW_HTTP=y`
   (component `esp_https_ota`). If the project's IDF version gates plain HTTP
   differently, record how.
3. Confirm all three targets (esp32, esp32c3, esp32c61) are built for modules
   with ≥4 MB flash in CI (`.github/workflows/firmware-esp32.yml` and the
   sdkconfig files). If any target must stay on 2 MB → STOP (see below).

**Verify**: a short `plans/notes` comment in the PR description (or plan
update) recording: bin size per target, IDF version, HTTP-OTA knob. No code
changes in this phase.

### Phase 1 - Server

1. Migration `<next>_ota_updates.sql`:

   ```sql
   CREATE TABLE ota_updates (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     device_id TEXT NOT NULL,
     user_id TEXT NOT NULL,
     old_token_id TEXT,
     new_token_id TEXT NOT NULL,
     sha256 TEXT NOT NULL,
     size INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     created_at INTEGER NOT NULL
   );
   CREATE INDEX idx_ota_updates_device ON ota_updates(device_id, status);
   ```

   Add the table type to `apps/server/src/types.d.ts` (match existing
   `table*` types).
2. `pushOtaUpdate.ts` (POST `.../devices/:deviceId/ota`): validate project +
   device ownership exactly like `downloadFirmware.ts` (copy those two
   queries); build the patched image by extracting the patching core of
   `downloadFirmware.ts` into a shared helper
   (`apps/server/src/foundation/firmwareImage.ts`) so the two endpoints share
   `padAsciiToLength`/`replacePossiblySplitAscii`/checksum logic instead of
   duplicating it (anti-redundancy rule). Token handling per Design #3.
   Compute sha256 (`crypto.subtle.digest`), store blob at
   `ota/<artifactId>.bin`, insert the row, then call
   `triggerDeviceOtaUpdate(env, projectId, deviceId, payload)` in new
   `foundation/deviceOta.ts` (mirror `deviceReboot.ts`; the `DeviceSession`
   stub method sends the `ota_update` frame and resolves on the device ack,
   5 s timeout like other commands). If the device is offline or does not
   ack: mark the row `failed`, delete the pending token + blob, return
   `{ success: false, error: "Device offline or did not acknowledge" }` 409.
3. `downloadOtaImage.ts` (GET `/v1/ota/:artifactId`): authenticate via the
   standard auth middleware (device API token); verify the artifact row is
   `pending`, verify the authenticated user owns it, stream the blob with
   `Content-Length`. Do NOT delete on download (finalize happens on
   reconnect).
4. Finalize hook: thread the authenticated token id into the device WS
   connect path (`wsRoutes.ts` / `auth.ts` - the auth layer already resolves
   the token row to hash-match; expose its id on the context). In the session
   connect path, look up a `pending` `ota_updates` row with
   `new_token_id = <connected token id>`; if found, finalize per Design #3.
5. Janitor: in `janitor.ts`, expire `pending` rows older than 24 h (delete
   blob + pending token, set status `expired`).
6. Regenerate `apps/server/openapi.json`.

**Verify**: `pnpm test --filter @devicesdk/server` and
`pnpm check-types --filter @devicesdk/server` → pass, plus new tests (Test
plan below).

### Phase 2 - Firmware (ESP32)

1. Partition table + `CONFIG_ESPTOOLPY_FLASHSIZE_4MB=y` +
   `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y` +
   `CONFIG_ESP_HTTPS_OTA_ALLOW_HTTP=y` in `sdkconfig.defaults` (and the
   esp32c3/esp32c61 variants as applicable per the Phase 0 findings).
2. `main/ota_handler.c`: task that takes `{path, size, sha256}`, builds the
   URL from the configured host (`DEVICESDK_API_HOST` region - see how
   `websocket_handler.c`/`devicesdk_main.c` compose the WS URL and reuse
   that host parsing), runs `esp_https_ota` with an `Authorization: Bearer
   <DEVICESDK_API_TOKEN>` header, verifies sha256 incrementally (mbedtls
   sha256, already linked), sets boot partition, `esp_restart()`. Emit
   progress logs via the standard `ESP_LOGI` tag conventions used in
   neighboring files.
3. `websocket_handler.c`: parse `"ota_update"` frames (model after the
   `"reboot"` branch at line 102), ack success immediately, hand the payload
   to the OTA task. Reject (error response) if an OTA is already running.
4. `devicesdk_main.c`: after the WebSocket is connected AND authenticated
   (the point where the device is known-good), call
   `esp_ota_mark_app_valid_cancel_rollback()` when the running app state is
   `ESP_OTA_IMG_PENDING_VERIFY`.
5. Update `firmware/esp32/README.md` build/partition notes. Changeset for
   `@devicesdk/firmware-esp32`.

**Verify**: `cd firmware/esp32 && idf.py build` for each target if the
toolchain exists locally; otherwise the firmware CI workflow on the PR is the
gate (all targets green).

### Phase 3 - CLI

1. New command `devicesdk ota <projectId> <deviceId> --device-type <t>
   --ssid <s> --pass <p> [--host <h>]` in `packages/cli/src/commands/`
   (register in `index.ts`, follow the structure of the existing flash
   command for flag parsing and prompts): POST to the OTA endpoint, print the
   ack, then poll the existing device-status endpoint (see
   `packages/cli/src/commands/` status command for the call) every 3 s for up
   to 120 s and report when the device reconnects ("update applied") or time
   out with a "check `devicesdk logs`" hint.
2. CLI tests for arg validation + a mocked happy path (vitest, model after
   existing command tests).
3. Changeset for `@devicesdk/cli`.

**Verify**: `pnpm test --filter @devicesdk/cli` → pass.

### Phase 4 - Docs + handoff

- `ROADMAP.md`: mark OTA shipped for ESP32, note Pico deferred.
- `README.md` firmware section: one paragraph on `devicesdk ota` and the
  one-time USB reflash needed to adopt the OTA partition table.
- PR description: Phase 0 numbers, the token-lifecycle design, and a bold
  "owner must hardware-validate before merge" note.

## Test plan

Server (`bun test`, colocated `*.test.ts`, model after existing endpoint
tests):

- `firmwareImage.ts` helper: patching + checksum parity with the old
  `downloadFirmware` behavior (byte-for-byte on a fixture binary containing
  the placeholder strings).
- `pushOtaUpdate`: happy path creates row + pending token WITHOUT deleting the
  old token (assert both token rows exist); device-offline path cleans up the
  pending token and blob.
- `downloadOtaImage`: auth required; wrong user 404; streams exact bytes +
  `Content-Length`.
- Finalize: simulated reconnect with the new token id deletes the old token,
  renames the new one, marks `completed`.
- Janitor: pending row older than 24 h → blob + pending token gone, status
  `expired`; the OLD token still present.

CLI (vitest): command arg validation, happy-path POST + status polling with
mocked API.

Firmware: CI build of all targets is the automated gate; on-hardware
validation (flash via USB with new table → `devicesdk ota` → device comes
back on new image → `esp_ota_mark_app_valid` confirmed via logs → pull power
mid-download → device still boots old image) is the OWNER's manual step,
listed in the PR checklist.

## Done criteria

- [ ] `pnpm test --filter @devicesdk/server` exits 0 incl. new OTA tests
- [ ] `pnpm check-types --filter @devicesdk/server` exits 0
- [ ] `pnpm test --filter @devicesdk/cli` exits 0 incl. new `ota` tests
- [ ] `pnpm lint` exits 0
- [ ] Firmware CI (esp32 + esp32c3 + esp32c61) green on the PR
- [ ] `grep -n "ota_update" firmware/esp32/main/websocket_handler.c` matches
- [ ] `grep -rn "DELETE" apps/server/src/endpoints/devices/pushOtaUpdate.ts`
      shows NO deletion of the old token at push time
- [ ] Changesets exist for `@devicesdk/server`, `@devicesdk/cli`,
      `@devicesdk/firmware-esp32`
- [ ] `apps/server/openapi.json` regenerated (diff shows the two new routes)
- [ ] PR description contains the hardware-validation checklist; PR NOT merged
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Phase 0 finds any target's app binary > `0x1E0000` bytes, or any supported
  module has < 4 MB flash - the partition plan collapses; the owner must
  choose slot sizes / target policy.
- Plan 008 (TLS) has landed: the OTA fetch must speak TLS with the pinned
  certificate and `CONFIG_ESP_HTTPS_OTA_ALLOW_HTTP` is wrong - the firmware
  half of this plan needs re-specification against the TLS code.
- Threading the authenticated token id to the WS connect path requires
  restructuring `auth.ts` beyond exposing an id that is already resolved
  internally (i.e. more than ~30 changed lines) - report; the fallback design
  (keep old tokens forever, surface them for manual cleanup) is an owner
  decision, not yours.
- The device ack for `ota_update` cannot reuse the existing 5 s
  pendingCommands path in `deviceSession.ts` without protocol changes visible
  to user scripts.
- Any change to `packages/core` seems required.

## Maintenance notes

- **Plan 008 interplay**: whichever of 008/this lands second must revisit the
  OTA fetch transport (plain HTTP vs pinned TLS) and SHOULD share the single
  breaking reflash. Update both plans' index rows with the chosen order.
- **Plan 007 interplay**: MQTT-transport devices (007) won't have a WS session
  to receive the `ota_update` frame; OTA-over-MQTT is a follow-up, out of
  scope here.
- Deferred: Pico OTA (needs a bootloader strategy), dashboard OTA button,
  firmware-version reporting + "update available" detection, resumable
  downloads.
- Reviewer scrutiny points: the old token must survive every failure path
  (grep the push endpoint for token deletion); sha256 verified on-device
  before `esp_ota_set_boot_partition`; janitor never deletes a token that has
  been finalized as the device's active token.
- Wi-Fi credentials pass through the OTA endpoint request body and into the
  patched image but are never persisted server-side - keep it that way.
