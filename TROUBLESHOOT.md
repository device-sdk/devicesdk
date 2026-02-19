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
