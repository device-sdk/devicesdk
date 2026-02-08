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

### ESP32 multi-port detection caused "Multiple serial ports detected" on Linux
**Date**: 2026-02-08
**Question/Problem**: Linux exposes USB serial devices as both `/dev/ttyUSB0` and a symlink at `/dev/serial/by-id/usb-Silicon_Labs_...`. The old code scanned both `/dev/` and `/dev/serial/by-id/`, saw 2 entries for the same physical device, and threw "Multiple serial ports detected".
**Root Cause**: `/dev/serial/by-id/` entries are symlinks to the same `/dev/ttyUSB*` device. Scanning both directories double-counted a single device.
**Solution**: Removed `/dev/serial/by-id/` scanning entirely. `listSerialPorts()` now only scans `/dev/` for `ttyUSB*` and `ttyACM*` entries. When no explicit `--port` is given, `waitForSerialPort()` returns the first detected port, and `flashESP32()` always passes `--port` to esptool (preventing esptool from auto-scanning all serial ports including dozens of inaccessible `/dev/ttyS*` legacy ports).
**Rule**: Only scan `/dev/ttyUSB*` and `/dev/ttyACM*` on Linux. Always pass `--port` to esptool.
