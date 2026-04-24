# Troubleshooting Log

### Local dev Google OAuth login completes but user remains unauthenticated
**Date**: 2026-02-07
**Question/Problem**: When running the API (wrangler dev, port 8787) and dashboard (Quasar dev, port 9000) locally, Google OAuth login completes visually but `GET /v1/user/me` returns 401. Only one `GET /v1/auth/google` request appears in API logs instead of two (initial + callback).
**Root Cause**: Two issues:
1. `redirect_uri` in `src/index.ts:98` pointed to port 9000 (dashboard) instead of 8787 (API). Google redirected the callback to the dashboard SPA, which has no handler for `/v1/auth/google`, so the callback never reached the API and no session was created.
2. Cookie flags in `src/foundation/auth.ts` for the local dev path used `domain: ".localhost"`, `sameSite: "None"`, and `secure: true`. Browsers reject `secure: true` cookies over HTTP, and `sameSite: "None"` also requires a secure context.
**Solution**:
1. Changed `redirect_uri` port from `9000` to `8787` in `apps/api/src/index.ts`.
2. Changed cookie settings in `apps/api/src/foundation/auth.ts` for both `handleGoogleCallback` and `handleLogout` local dev paths: `domain: "localhost"` (no leading dot), `sameSite: "Lax"`, `secure: false`.
3. Ensure `apps/api/.dev.vars` contains `ENV=local` so the local code paths activate (base `wrangler.jsonc` sets `ENV: "production"`).
4. Ensure `http://localhost:8787/v1/auth/google` is registered as an authorized redirect URI in Google Console.

### Pico hard-faults when API sends WebSocket close frame immediately after a data frame
**Date**: 2026-02-07
**Question/Problem**: After deploying a script, the device freezes (LED stuck, no reboot). The API sent a reboot command and then immediately called `session.websocket.close(4001, ...)`. Both frames arrived in the same TCP segment on the Pico.
**Root Cause**: The Pico firmware processes frames sequentially inside `process_rx_buffer()`. The text frame queues a reboot command to Core 1, but before `watchdog_reboot()` fires, the close frame (opcode 0x8) triggers `close_connection()` → `tcp_close(tcp_pcb)` **from inside the lwIP recv callback**. This frees the PCB that lwIP still references after the callback returns, causing a hard fault.
**Solution**: Remove the explicit `websocket.close()` call after sending the reboot command. The device reboots via `watchdog_reboot()`, the TCP connection drops naturally, and the DO's `webSocketClose`/`webSocketError` handler fires from the infrastructure side.
**Rule**: Never send a WebSocket close frame immediately after a command that triggers a device reboot. Let the connection drop on its own.

### Durable Object `webSocketError` handler needed for abrupt TCP drops
**Date**: 2026-02-07
**Question/Problem**: After fixing the above crash, the device successfully rebooted and reconnected, but `onDeviceDisconnect` never ran in the user script — no "Device disconnected" log appeared.
**Root Cause**: When a device hard-reboots (`watchdog_reboot()`), the TCP connection dies without a clean WebSocket close handshake. The DO runtime fires `webSocketError()` for this, **not** `webSocketClose()`. The codebase only had `webSocketClose()`, so the abrupt disconnect went unhandled.
**Solution**: Add a `webSocketError(ws, error)` handler to `BaseDevice` that runs the same cleanup path as `webSocketClose` (reject pending commands, clear session, call `onDeviceDisconnect`). Extracted shared logic into `handleConnectionLost()`.
**Rule**: Always implement both `webSocketClose()` and `webSocketError()` on Durable Objects that manage device WebSocket connections.

### ESP32 flash fails with "Path '/dev/ttyUSB0' is not readable" from esptool
**Date**: 2026-02-08
**Question/Problem**: Running `devicesdk flash` on Linux with an ESP32 connected fails with esptool error: `Invalid value for '--port' / '-p': Path '/dev/ttyUSB0' is not readable.`
**Root Cause**: On Linux, serial ports (`/dev/ttyUSB*`, `/dev/ttyACM*`) are owned by `root:dialout`. If the current user is not in the `dialout` group, they cannot read/write the port. esptool's error message is not immediately clear about this being a permissions issue.
**Solution**: The CLI now checks `fs.access(port, R_OK | W_OK)` before invoking esptool and provides a clear error message with the fix command. To fix the underlying issue:
1. Run `sudo usermod -a -G dialout $USER`
2. Log out and back in (or reboot) for the group change to take effect
3. Verify with `groups` that `dialout` appears in the output

### ESP32-C61 build fails: RISC-V toolchain not found
**Date**: 2026-02-08
**Question/Problem**: Building the ESP32 firmware with `idf.py set-target esp32c61 && idf.py build` fails because the RISC-V cross-compiler (`riscv32-esp-elf-gcc`) is not found. The ESP32-C61 uses a RISC-V core, unlike the original ESP32 which uses Xtensa.
**Root Cause**: ESP-IDF's `install.sh` only installs toolchains for the targets you specify. If you originally installed for `esp32` (Xtensa), the RISC-V toolchain needed by C61 is missing.
**Solution**: Re-run the ESP-IDF installer with the C61 target:
```bash
cd ~/esp/esp-idf
./install.sh esp32c61
source export.sh
```
You can also install multiple targets at once: `./install.sh esp32,esp32c61`.

### ESP32-C61 build fails: app binary exceeds partition size
**Date**: 2026-02-08
**Question/Problem**: `idf.py build` succeeds but the binary is too large for the default factory partition. The RISC-V binary for ESP32-C61 is significantly larger than the Xtensa ESP32 binary and exceeds the default 1MB app partition.
**Root Cause**: The default ESP-IDF partition table allocates only 1MB (`0x100000`) for the factory app partition. The C61 RISC-V binary (with WebSocket, TLS, WiFi) exceeds this.
**Solution**: Use a custom `partitions.csv` that enlarges the factory partition to ~1.94MB:
```csv
# Name,   Type, SubType, Offset,  Size,   Flags
nvs,      data, nvs,     0x9000,  0x6000,
phy_init, data, phy,     0xf000,  0x1000,
factory,  app,  factory, 0x10000, 0x1F0000,
```
Enable it in `sdkconfig.defaults` (or `sdkconfig.defaults.esp32c61`):
```
CONFIG_PARTITION_TABLE_CUSTOM=y
CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions.csv"
```

### ESP32-C61 flash fails: "No serial data received"
**Date**: 2026-02-08
**Question/Problem**: Running `esptool.py write_flash` with `--before default_reset` prints `Connecting...` then fails with "No serial data received". The board is connected via its UART USB-C port (`/dev/ttyUSB0`).
**Root Cause**: `--before default_reset` toggles DTR/RTS serial lines to automatically put the chip into download mode. Some ESP32-C61 dev boards don't have DTR/RTS wired from the USB-UART bridge to the EN and GPIO9 (boot) pins, so the auto-reset has no effect and the chip never enters download mode.
**Solution**: Use manual boot mode instead:
1. Hold the **BOOT** button (GPIO9)
2. While holding BOOT, press and release the **RESET** button (EN)
3. Release the BOOT button — the chip is now in download mode
4. Flash with `--before no_reset`:
   ```bash
   devicesdk flash <device-id> --before no_reset
   ```
Some boards also have a jumper (e.g. J5) that forces boot mode when shorted. If your board has a USB-JTAG port (second USB-C connector, appears as `/dev/ttyACM0`), try that instead — it often supports auto-reset. Lower the baud rate with `--baud 115200` if you still see connection issues.

### ESP32 multi-port detection caused "Multiple serial ports detected" on Linux
**Date**: 2026-02-08
**Question/Problem**: Linux exposes USB serial devices as both `/dev/ttyUSB0` and a symlink at `/dev/serial/by-id/usb-Silicon_Labs_...`. The old code scanned both `/dev/` and `/dev/serial/by-id/`, saw 2 entries for the same physical device, and threw "Multiple serial ports detected".
**Root Cause**: `/dev/serial/by-id/` entries are symlinks to the same `/dev/ttyUSB*` device. Scanning both directories double-counted a single device.
**Solution**: Removed `/dev/serial/by-id/` scanning entirely. `listSerialPorts()` now only scans `/dev/` for `ttyUSB*` and `ttyACM*` entries. When no explicit `--port` is given, `waitForSerialPort()` returns the first detected port, and `flashESP32()` always passes `--port` to esptool (preventing esptool from auto-scanning all serial ports including dozens of inaccessible `/dev/ttyS*` legacy ports).
**Rule**: Only scan `/dev/ttyUSB*` and `/dev/ttyACM*` on Linux. Always pass `--port` to esptool.

### ESP32 firmware binary patching invalidates image checksum
**Date**: 2026-02-19 (fixed 2026-02-19)
**Question/Problem**: Downloading firmware via the API's `/v1/devices/:id/firmware` endpoint (which replaces placeholder strings with real WiFi/token/host credentials) and flashing the patched binary fails with `Checksum failed. Calculated 0x17 read 0x4b` and `Factory app partition is not bootable`.
**Root Cause**: The API patches credentials by doing a byte-level string replacement in the merged binary. ESP-IDF app images (at offset `0x10000`) contain a 1-byte XOR checksum and a 32-byte SHA256 hash. Modifying bytes without recalculating both invalidates the image.
**Solution**: `apps/api/src/foundation/esp32ImageChecksum.ts` — `recalculateEsp32Checksum()` is called after credential patching in `downloadFirmware.ts`. It parses the ESP-IDF image header, walks all segments to XOR data bytes (init `0xEF`), writes the checksum at the 16-byte-aligned position, then recomputes the SHA256 hash via `crypto.subtle.digest`. Verified against a real 5-segment ESP32-C61 firmware binary.

### ESP32-C61 has no RMT peripheral — use SPI backend for led_strip
**Date**: 2026-02-19
**Question/Problem**: Adding the `espressif/led_strip` component and using `led_strip_new_rmt_device()` results in an undefined reference linker error. The header exists and the library is on the link line, but the symbol isn't found.
**Root Cause**: The ESP32-C61 does **not** have `CONFIG_SOC_RMT_SUPPORTED`. The led_strip component's CMakeLists.txt conditionally compiles the RMT backend only when `CONFIG_SOC_RMT_SUPPORTED` is set. Without it, the RMT source files (`led_strip_rmt_dev.c`, `led_strip_rmt_encoder.c`) are never compiled, hence the linker error.
**Solution**: Use the SPI backend instead:
```c
#include "led_strip_spi.h"  // NOT led_strip_rmt.h

led_strip_spi_config_t spi_config = {
    .clk_src = SPI_CLK_SRC_DEFAULT,
    .spi_bus = SPI2_HOST,
    .flags.with_dma = true,
};
ESP_ERROR_CHECK(led_strip_new_spi_device(&strip_config, &spi_config, &led_strip_handle));
```
**Rule**: Always check `CONFIG_SOC_RMT_SUPPORTED` in `build/config/sdkconfig.h` before using RMT-dependent APIs. ESP32-C61 only has SPI (`CONFIG_SOC_GPSPI_SUPPORTED`).

### Calling `stub.fetch()` on a DO in tests causes "Isolated storage failed"
**Date**: 2026-03-15
**Question/Problem**: Integration tests that call `stub.fetch()` on a Durable Object fail with "Isolated storage failed. Expected .sqlite, got ...sqlite-shm". Tests using RPC methods on the same DO work fine.
**Root Cause**: When a DO is accessed via `stub.fetch()` in the `@cloudflare/vitest-pool-workers` test environment, Miniflare initializes SQLite in WAL mode, creating `.sqlite-shm` and `.sqlite-wal` files. The test isolation checker expects only `.sqlite` files after teardown, so it fails.
**Solution**: Expose business logic through RPC methods on the DO class (e.g., `handleCommand()`) instead of routing through `stub.fetch()`. RPC methods work cleanly in tests without triggering WAL file creation issues.
**Rule**: In API endpoints that need to call into a DO, use RPC (direct method calls on the stub) rather than `stub.fetch()`. This is also consistent with how `getConnectionStatus()`, `triggerRebootForDeploy()`, etc. work.

### `z.enum()` in chanfana 3.x request body schema causes unhandled Zod v4 errors
**Date**: 2026-03-15
**Question/Problem**: Using `z.enum(VALUES)` in a chanfana `OpenAPIRoute` request body schema causes all requests to that endpoint to fail with 500 — even requests with valid enum values. Chanfana's `validateRequest()` throws a `TypeError: Cannot read properties of undefined (reading '_zod')` for valid inputs, and fails to catch Zod v4's `ZodError` for invalid enum values.
**Root Cause**: Chanfana 3.2.x was not fully updated for Zod v4's internal API. The `z.enum()` type combined with the schema's `strictObject` wrapping causes parsing failures. Chanfana catches `instanceof ZodError` but Zod v4's error class behaves differently.
**Solution**: Use `z.string()` in the chanfana schema and do the enum validation manually in the `handle()` method with an explicit `includes()` check, returning a 400 response.
**Rule**: Avoid `z.enum()` in chanfana body schemas when using Zod v4. Validate enum-like fields manually in the handler.

### ESP32-C61-DevKitC-1 onboard LED is an addressable WS2812 on GPIO 8
**Date**: 2026-02-19
**Question/Problem**: Setting GPIO 5 (or any simple GPIO) high/low doesn't blink the onboard LED. The LED appears always on or unresponsive to GPIO toggling.
**Root Cause**: The ESP32-C61-DevKitC-1 board has a **WS2812 addressable RGB LED** on **GPIO 8**, not a simple GPIO-controlled LED. It requires the `espressif/led_strip` component with a timed digital protocol (NeoPixel/WS2812), not simple high/low signals.
**Solution**:
1. Add `espressif/led_strip: '*'` to `main/idf_component.yml`
2. Use `CONFIG_IOTKIT_LED_IS_ADDRESSABLE` in Kconfig (defaults to `y` for `IDF_TARGET_ESP32C61`)
3. In hal.c, use `led_strip_new_spi_device()` (SPI backend, since C61 lacks RMT)
4. Control LED with `led_strip_set_pixel(handle, 0, r, g, b)` + `led_strip_refresh()` for ON, `led_strip_clear()` for OFF
5. Intercept GPIO 8 and virtual pin 99 in `iotkit_hal_set_gpio()` to route through led_strip driver

### Biome `noConstantCondition` rejects `while (true)` in pagination loops
**Date**: 2026-04-04
**Question/Problem**: Using `do { ... } while (true)` or `while (true) { ... break; }` to loop through paginated results triggers a Biome lint error (`noConstantCondition`). Committing fails because `pnpm lint` catches it.
**Root Cause**: Biome enforces `noConstantCondition` by default, treating `while (true)` as a constant-expression loop.
**Solution**: Use a mutable boolean variable: `let hasMore = true; while (hasMore) { ...; hasMore = result.has_more; }` — or use `do { } while (cursor)` with a cursor that becomes `undefined` when exhausted.

### R2 `list()` silently truncates at 1000 objects
**Date**: 2026-04-04
**Question/Problem**: `env.SCRIPTS.list({ prefix })` returns at most 1000 objects. Scripts beyond that limit were silently skipped during purge/deletion operations.
**Root Cause**: Cloudflare R2's `list()` API returns a maximum of 1000 results per call. When `listed.truncated === true`, more objects exist that require another call using the provided `cursor`.
**Solution**: Paginate with a cursor loop:
```typescript
let r2Cursor: string | undefined;
do {
  const listed = await env.SCRIPTS.list({ prefix, cursor: r2Cursor });
  for (const obj of listed.objects) { await env.SCRIPTS.delete(obj.key); }
  r2Cursor = listed.truncated ? listed.cursor : undefined;
} while (r2Cursor);
```

### CLI token auth path requires `dsdk_` prefix — test tokens without prefix fall to 401
**Date**: 2026-04-04
**Question/Problem**: An integration test for suspended-user CLI token auth was returning 401 instead of 403. The token was inserted into `cli_tokens` with a valid hash, but the test still failed.
**Root Cause**: `auth.ts` checks `token.startsWith("dsdk_")` (and not `"dsdk_refresh_"`) to route into the CLI token auth branch. Tokens that don't start with `dsdk_` fall through to the session/API token path, where the token hash is not found → 401.
**Solution**: Prefix the test token with `dsdk_`: use `"dsdk_suspended-user-cli-token"` instead of `"suspended-user-cli-token"`.
**Rule**: All CLI `access_token` values must begin with `dsdk_`. Use this prefix in tests that exercise the CLI token path.

### `getProject` endpoint fired N DO RPC calls to get live device status
**Date**: 2026-04-04
**Question/Problem**: `GET /v1/projects/:projectId` was calling `getDeviceConnectionStatus()` on each device's Durable Object to return `"online"/"offline"` status. For projects at the device limit, every request spawned N concurrent DO subrequests.
**Root Cause**: Live connection status was not persisted anywhere — the only source of truth was the running DO instance.
**Solution**: Added a `connected INTEGER NOT NULL DEFAULT 0` column to the `devices` table (migration `0019_add_connected_to_devices.sql`). The DO writes `connected = 1` on WebSocket connect and `connected = 0` on disconnect/error. `getProject.ts` reads the column directly from D1 — zero extra network hops.

### ESP32 WebSocket handshake fails against `api.devicesdk.com` with "Header size exceeded buffer size"
**Date**: 2026-04-24
**Question/Problem**: ESP32 firmware connects to Wi-Fi, TLS cert validates (`esp-x509-crt-bundle: Certificate validated`), then the WebSocket Upgrade fails with `transport_ws: Header size exceeded buffer size` / `errno=119`. Device loops through `WEBSOCKET_EVENT_ERROR` every 10 s and never reaches `WEBSOCKET_EVENT_CONNECTED`. Symptoms on-device: LED never blinks 3× (cloud-connected), OLED stays blank because the server never gets to send `display_update`.
**Root Cause**: The ESP-IDF `tcp_transport` component uses a single buffer sized by `CONFIG_WS_BUFFER_SIZE` (default **1024 bytes**) for both the outgoing HTTP Upgrade request *and* the server's response headers. Cloudflare's WebSocket upgrade response carries `cf-ray`, `set-cookie: __cf_bm=…` (often >180 bytes), `alt-svc`, `nel`, `report-to`, `server`, `date`, `via`, `content-type`, etc. — easily exceeding 1 KB. Check is at `transport_ws.c:308` inside a `do { esp_transport_read(... WS_BUFFER_SIZE - 1 - header_len ...) } while (header_len < WS_BUFFER_SIZE - 1)`. The `buffer_size` field of `esp_websocket_client_config_t` is **not** the same thing — that one sizes the WS frame rx/tx buffers, not the handshake buffer.
**Solution**: Set `CONFIG_WS_BUFFER_SIZE=2048` in `firmware/esp32/sdkconfig.defaults` (applies to all targets). Also bumped `esp_websocket_client_config_t.buffer_size = 2048` defensively — large inbound frames (`display_update` framebuffers, script env blobs) will hit the 1024 frame-buffer default eventually.
**Rule**: When the firmware talks to any Cloudflare-fronted service, `CONFIG_WS_BUFFER_SIZE` must be at least 2048. Do not confuse this Kconfig with `esp_websocket_client_config_t.buffer_size` — they size unrelated buffers.

### ESP32 panics with "Stack protection fault" inside `websocket_task` on first received command
**Date**: 2026-04-24
**Question/Problem**: After the WS upgrade buffer fix (see entry above), the device connects successfully and sends `device_connected`, but the moment the server replies with any command (`set_gpio_state`, `i2c_configure`, `display_update`), the device panics: `Guru Meditation Error: Core 0 panic'ed (Stack protection fault). Detected in task "websocket_task"`. The panic dump shows `SP` ~700 bytes below the stack bounds. Commands eventually time out with `HTTP 504 "device did not respond"`.
**Root Cause**: The task name `"websocket_task"` is the ESP-IDF `esp_websocket_client` component's *own* internal task (created at `managed_components/espressif__esp_websocket_client/esp_websocket_client.c:1285`), not our `websocket_task()` in `iotkit_main.c`. Its default stack is `WEBSOCKET_TASK_STACK = 4*1024` bytes. The client dispatches event callbacks synchronously inside that task — so our `websocket_event_handler` (cJSON parse + `ESP_LOGI("Received: %s", …)` + `handle_websocket_message` → `queue_command`) runs there too. Measured peak usage on C3: **~8.9 KB**. 4 KB overflows hard; even 8 KB falls short by ~700 B.
**Solution**: Set `.task_stack = 16384` in the `esp_websocket_client_config_t` passed to `esp_websocket_client_init`. The field exists specifically to override this default.
**Rule**: Don't trust the name "websocket_task" in a panic dump — that is the ESP-IDF client's internal task, distinct from any task you created with the same name. Always size `esp_websocket_client_config_t.task_stack` explicitly if your event handler does anything non-trivial (JSON parse, logging, queueing).

### ESP32 panics in task "worker" on first `display_update` command
**Date**: 2026-04-24
**Question/Problem**: After fixing the websocket task stack (previous entry), the device still panics — but now the panic task is `"worker"` (not `"websocket_task"`), and the trigger is the first `display_update` command rather than any `set_gpio_state`. `/v1/projects/:p/devices/:d/command` returns `HTTP 504 "Command timed out"` and the panic dump shows stack overflow ~8 KB.
**Root Cause**: The worker task (`firmware/esp32/main/iotkit_main.c`'s `xTaskCreate(worker_task_entry, "worker", 8192, …)`) calls `handle_display_update` in `worker_task.c:497`, which puts a 1 KB `uint8_t fb_data[MAX_DISPLAY_BUFFER_SIZE]` and a 192 B `display_segment_t segments[MAX_DISPLAY_SEGMENTS]` on the stack before calling into `display_init_ssd1306` + `display_write_fb_ssd1306` which do more chunked I2C writes with another local `uint8_t chunk[33]`. Peak stack usage blew past 8 KB.
**Solution**: Bumped the worker task from 8192 → 16384 in `xTaskCreate` (iotkit_main.c).
**Rule**: Any worker task that may handle `display_update`, large I2C batch writes, or future large binary payloads should be sized ≥16 KB. Consider moving `fb_data` and `segments` to `static` / heap to recover stack budget if it ever gets tight again.
