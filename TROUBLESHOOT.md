# Troubleshooting Log

### Cloudflare "Durable Object rows written" free-tier quota alert
**Date**: 2026-06-06
**Question/Problem**: Recurring CF emails that the free tier for **Durable Object rows written** was exceeded, with only a handful of real devices connected — raising the fear of a runaway paid-tier bill. Is this real load or waste, and how do we stop a regression from silently inflating it?
**Root Cause**: The `Device` DO is SQLite-backed (`new_sqlite_classes: ["Device"]` in `wrangler.jsonc`), so **every** KV op (`storage.put/get/delete/list`) **and** every `device_logs` `sql.exec` bills as rows read/written. A "rows written" spike is almost always a hot path (per-message / per-alarm / per-connect / per-log) writing O(N) rows where O(1) was intended, or an unbounded table — not legitimate scale. Two non-obvious cost multipliers found while building the guardrail: (1) **the pending user-event queue** (`PENDING_USER_EVENTS_KEY`) is one KV value, so appending is 1 row written regardless of backlog length — but a reconnect/message storm still re-writes it once *per event enqueued*, which adds up; (2) **each `device_logs` insert costs 3 row-writes**, not 1 — the table row + the `TEXT PRIMARY KEY` auto-index + the `idx_logs_created_at` index. Chatty user `console.log()` is therefore 3× as expensive as it looks against the rows-written quota.
**Solution**: Diagnose first (CF dashboard → DO usage breakdown: requests vs. rows-read vs. rows-written vs. storage; if rows-written dominates with few devices, it's a hot-path/loop bug). To prevent regressions, added **row-budget guardrail tests**: `apps/api/tests/integration/storageRowBudget.test.ts` drives the real queue/log code paths through `apps/api/tests/helpers/meteredStorage.ts` — a transparent counting Proxy around the real `DurableObjectStorage` (obtained via `runInDurableObject`) that tallies KV rows and per-`exec` `cursor.rowsRead`/`rowsWritten`. The tests pin: enqueue/drain stay O(1) writes regardless of backlog (redundant `connect` coalesces to 0 writes); each log insert is a constant 3 row-writes with 0 per-insert scan; the overflow cleanup is wall-clock throttled (≤1 scan per burst) and trims to `LOG_MAX_STORED`. A change that inflates per-op row writes now fails CI instead of becoming a bill. Note for future cost work: dropping `idx_logs_created_at` (or batching log inserts) would cut log-write cost by ~1/3.

### Device reconnects every few minutes; per-device alarm wedges on "Too many subrequests" even with an empty event queue
**Date**: 2026-06-04
**Question/Problem**: A connected `examples/esp32c3-clock` device reconnected every 2–3 minutes. `wrangler tail` showed the per-minute cron `alarm()` running ~60 s (`wallTime≈60000`, `cpuTime: 0`, `outcome: ok`) and logging `Error in user worker onCron: Too many subrequests by single Worker invocation` — **and** the same error from `onDeviceConnect` on reconnect. This looked identical to the 2026-05-29 unbounded-drain wedge below, but instrumentation (`[DIAG]`) proved it was a *different* root cause: on the wedged ticks `pendingEvents = 0`, `deviceSockets ≤ 1`, `watcherSockets = 0` (no backlog, no ghost sockets), and `diagOnCronMs = 0` / `diagAlarmMs = 0` — i.e. the hook threw on its *first* call with **no awaited I/O having advanced `Date.now()`** in the whole invocation. The deployed user script was the trivial stock clock (≈3 RPCs/hook), so it could not itself issue ~1000 subrequests.
**Root Cause**: `getOrCreateUserWorker` cached the resolved `getTarget()` handle in `this.cachedUserWorker` and reused it **across DO invocations** (added in #87 to dodge the "Too many concurrent dynamic workers" limit). But a `getTarget()` return is a **child-isolate RPC stub scoped to the invocation that created it** (see the cloudflare-runtime-limitations skill). The creating invocation ends → the child isolate is recycled → the cached stub is stale. Calling `onCron`/`onDeviceConnect`/`getCrons` on that stale cross-invocation stub fans out subrequests that never resolve, blowing the per-invocation subrequest cap with `Date.now()` frozen (fire-and-forget, nothing completes) and pinning `wallTime` at the ~60 s wall. The 60 s hang froze the single-threaded DO so it couldn't service the device's WebSocket PING/PONG → firmware half-open detection (#131) tripped → reconnect loop. A second `[DIAG2]` deploy confirmed it: **every** 60 s wedge logged `cache=warm`; fast ticks were warm-without-a-hook-call; even a 10 s-old stub wedged.
**Solution**: Make the worker stub **invocation-scoped** — clear `this.cachedUserWorker = null` at the top of every DO invocation entry point that resolves a worker (`alarm()`, `handleRemoteCall()`), so each invocation re-resolves a fresh stub (`apps/api/src/durableObjects/lib/device.ts`, PR #140). The cache still serves *intra-invocation* reuse (drain + cron in one tick share the threaded `drainedWorker`), so a stable `workerId` keeps it one underlying worker and the concurrent-dynamic-workers limit is not hit. Confirmed in prod: zero `Too many subrequests`, alarm wall-times back to 22–300 ms, and `last_connected_at` stable (one continuous connection) instead of bumping every few minutes. Regression test: `tests/integration/deviceReconnect.test.ts` asserts `alarm()` clears the cache.
**Rule**: **Never cache a Worker-Loader `getTarget()` stub (or any RPC stub) across DO invocations.** They are valid only within the invocation that resolved them; reusing one later either hangs or fans out subrequests until the cap trips. Re-resolve per invocation (a stable Loader `id` makes this cheap and avoids the concurrent-workers limit); cache only *within* a single invocation. When `wrangler tail` shows `wallTime≈60000` + `cpuTime 0` **and** your own timing deltas read 0 ms, it's fire-and-forget subrequests that never resolve — look at what RPC handle is being called, not at CPU work.
**Dead ends (don't re-tread)**: three fixes shipped before the real one, each disproved by data — (1) **bounding the event-drain** (wedge persisted with `pendingEvents = 0`); (2) a **pending-event-backlog** theory (the `[DIAG]` anomaly log never fired → no backlog); (3) **ghost/zombie device sockets** (a real latent bug fixed in PR #136, but `deviceSockets ≤ 1` on the wedged ticks, so not this). Lesson: instrument with a **discriminator** (here: warm-vs-cold stub) and don't ship a *guessed* fix more than once — each wrong fix costs a prod deploy cycle and muddies the signal. Full methodology in `.claude/skills/debug-prod-worker-wedge`.
**Re-investigating**: the `[DIAG]`/`[DIAG2]` probes are kept permanently in `device.ts` behind the `DEVICE_DIAG_LOGS` env var (off by default, zero overhead via the `diagOn` getter). To turn them on: set `DEVICE_DIAG_LOGS` to `"1"` in `apps/api/wrangler.jsonc` (the top-level **and** the `env.production` `vars` blocks) + redeploy, `wrangler tail --env production --format json`, then set it back to `"0"`.

### Per-minute cron wedges on "Too many subrequests by single Worker invocation"; screen never updates (stuck on firmware boot text)
**Date**: 2026-05-29
**Question/Problem**: Right after PR #120 deployed (which revived connection-gated crons on reconnect), a power-cycled `examples/esp32c3-clock` device connected, drew the firmware's "Server" boot text, sent `device_connected` — and then never showed the clock. `wrangler tail` on `devicesdk-api` showed the per-minute alarm firing (`executionModel: durableObject`, `event: scheduled`, every minute) but each invocation ran ~60 s (`wallTime: 60000`, `cpuTime: 0`, `outcome: ok`) and logged `Error in user worker onCron: Error: Too many subrequests by single Worker invocation`. D1 had `connected: 0` for the device yet alarms kept firing (so `getWebSockets("device")` was non-empty → **accumulated zombie/half-open sockets**). The deployed `onCron` (pulled from R2) was trivial — one `kv.get` + one `sendCommand` — so `onCron` itself could not be making thousands of subrequests.
**Root Cause**: `drainPendingUserWorkerEvents` flushed the **entire** `PENDING_USER_EVENTS_KEY` queue in one alarm invocation. While the cron alarm was dead (the half-open stall fixed by #120), the device's reconnect churn / unsolicited messages kept appending deferred events with nothing draining them — building a large backlog. Once #120 revived the alarm, every tick tried to dispatch the whole backlog (one cross-worker RPC per event), blowing the per-invocation subrequest cap. The cap breach aborts the invocation **before** it reaches the cron dispatch (so `onCron` fails / never sends the frame) and before it can effectively trim the queue, so the backlog never shrinks — a permanent per-minute wedge. #120 did not *cause* this; it un-paused the alarm and exposed a latent unbounded-drain bug.
**Solution**: Bound the drain — `drainPendingUserWorkerEvents` now processes at most `MAX_DRAIN_BATCH` (50) events per invocation, persists the remainder, and arms a follow-up alarm to keep draining (`apps/api/src/durableObjects/lib/userEventQueue.ts`). Because each invocation stays well under the subrequest cap, it commits cleanly, the backlog drains down over successive ticks, and `onCron` regains budget — the device self-heals once deployed. `enqueueUserWorkerEvent` also coalesces redundant `connect` events and hard-caps the queue at `MAX_PENDING_EVENTS` (500). Covered by `tests/unit/userEventQueue.test.ts`.
**Rule**: Any DO alarm that fans work out per queued item (or per socket) must **bound the work per invocation** — Worker invocations have a hard per-invocation subrequest cap, and exceeding it aborts the invocation, which can prevent the very write that would shrink the queue. When a `wrangler tail` event shows `wallTime` pinned near 60000 ms with `cpuTime: 0`, suspect a fan-out of (possibly hanging/slow) subrequests, not CPU work. The zombie-socket accumulation (D1 `connected: 0` while alarms still fire) is the deeper transport gap — see the half-open entry below.

### Per-device cron stops firing after ~15 min while the device still shows `● online`
**Date**: 2026-05-29
**Question/Problem**: A device with a frequent cron (`crons = { tick: "* * * * *" }`, e.g. `examples/esp32c3-clock`) fired `onCron` every minute for ~15 minutes, then stopped permanently. `devicesdk logs` showed clean per-minute ticks up to the stop, then nothing; `devicesdk status` still reported `● online`; there was **no** `onDeviceConnect`/`onDeviceDisconnect` log and no reconnect. The OLED froze on its last frame.
**Root Cause**: The cost guard in PR #111. `alarm()` calls `deleteAlarm()` whenever it fires with `getWebSockets("device").length === 0`, and the only path that re-arms the alarm is `initializeCrons()`, which runs **only** after a fresh `device_connected` message is drained. A **half-open connection** strands this: the underlying TCP died (home-router/NAT idle timeout ~15 min), the runtime dropped the socket from `getWebSockets` **without** firing `webSocketClose`/`webSocketError` (so `handleConnectionLost` never ran → D1 `connected` stayed `1` → stale "online", no disconnect log), the next `alarm()` tick hit the guard and cancelled the alarm, and the device's `esp_websocket_client` never detected the dead socket (fire-and-forget app-ping, no pong required) so it never reconnected / re-sent `device_connected`. Net: cron dead forever, device still "online".
**Solution**: Re-arm the cron alarm from the persisted schedule on **every** `"device"` WebSocket accept, independent of the `device_connected` handshake — `rearmCronAlarmFromStorage()` in `apps/api/src/durableObjects/lib/device.ts`, called from the device connect handler (PR #120). It needs no user Worker, recomputes a fire time that elapsed while offline to the next occurrence (missed slot skipped), and never pushes out an already-sooner alarm.
**Rule**: A connection-gated DO alarm must re-arm on connection events that are independent of any device-sent handshake message. `getWebSockets()` going empty is **not** always paired with a `webSocketClose`/`webSocketError` (silent/half-open drops), so never make alarm liveness depend solely on a clean disconnect+reconnect+handshake cycle. Tests that mock `getWebSockets` (`triggerAlarm`/`triggerAlarmWhileConnected`) cannot catch this — exercise the connect-accept re-arm path directly.
**Remaining gap**: A device that stays half-open and *never* reconnects still won't resume until it reconnects; the firmware must detect dead sockets and reconnect. **Addressed for ESP32** (esp32 / esp32c3 / esp32c61): `firmware/esp32/main/iotkit_main.c` now sets `ping_interval_sec` / `pingpong_timeout_sec` (protocol-level WebSocket PING/PONG) plus TCP keep-alive on the `esp_websocket_client_config_t`. The app-level `{"type":"ping"}` text frame was fire-and-forget (the server short-circuits it without replying — see the `webSocketMessage` ping early-exit at `device.ts`), so it could never detect a dead path. Cloudflare's runtime PONGs every protocol PING for free without waking the hibernating DO, so a missing PONG within `pingpong_timeout_sec` proves the path is dead → the client's built-in auto-reconnect fires → re-sends `device_connected` → server `rearmCronAlarmFromStorage()` resumes the cron. The steady ping traffic also keeps NAT mappings warm, avoiding the idle drop entirely. **Still open for Pico** (raw-lwIP client, no `esp_websocket_client` equivalent) — tracked separately.

### `onDeviceConnect` silently never runs; device pings keep flowing; OLED stays in default-off (looks black)
**Date**: 2026-04-29
**Question/Problem**: After the alarm-based dispatch fix (PR #85), a device could reconnect, send `device_connected`, and pings would round-trip — but `onDeviceConnect` never executed. No `[Dx] enter` / `i2c_configure` / `display_update` logs appeared. The OLED stayed dark because `init: true` was never sent, and the SSD1306 power-on default is `DISPLAY_OFF`. `wrangler tail` showed the alarm dispatcher repeatedly failing with `Error: Too many concurrent dynamic workers` at `_BaseDevice.getOrCreateUserWorker`, then the connect event being requeued through the 1→2→4→8→16 s backoff and finally dropped at `MAX_USER_EVENT_ATTEMPTS`.
**Root Cause**: `getOrCreateUserWorker` called `this.env.LOADER.get(workerId, factory).getEntrypoint("ProxyEntrypoint").getTarget()` on every dispatch — every alarm tick, every inter-device RPC, every cron firing, every `onDeviceDisconnect`. Even with a stable `workerId`, each call counted as a new live instance reference against the runtime's "concurrent dynamic workers" budget. The pre-existing `// TODO: EW-9769 …` comment had explicitly disabled stub caching as a workaround for a now-fixed runtime bug, leaving the call rate uncapped.
**Solution**: Cache the resolved stub in a private `cachedUserWorker: { workerId, worker }` field on the DO and return early when `workerId` matches. `versionId` is part of `workerId`, so a script redeploy invalidates the cache automatically; DO eviction discards it naturally. See `apps/api/src/durableObjects/lib/device.ts:88` (field) and `getOrCreateUserWorker` (cache check + populate).
**Rule**: When `LOADER.get()` is invoked from a hot path inside a Durable Object, cache the resolved entrypoint stub on the DO instance. Stable `workerId` is necessary but not sufficient — repeated `LOADER.get` + `getTarget` calls still trip the rate limit.

### `DataCloneError: ServiceStub serialization requires the 'experimental' compat flag` from a Worker Loader child
**Date**: 2026-04-28
**Question/Problem**: Inside a Worker Loader-spawned child worker, calling a method on a parent-side `WorkerEntrypoint` binding throws `DataCloneError: ServiceStub serialization requires the 'experimental' compat flag.` The `experimental` compatibility flag is rejected by the Workers control plane on production deploys, so it cannot be enabled.
**Root Cause**: Calling `.bind()` on what looks like a method of an RPC binding. `env.SOMETHING` is an RPC stub, not a JS object, so `env.SOMETHING.method` is also a stub representing that property — not a real `Function`. Calling `.bind()` on the property is interpreted by the runtime as a **remote method invocation** named `"bind"` with the stub itself passed as the first argument. The argument can't be cloned across the isolate boundary without the experimental flag, so the call throws.
**Solution**: Don't call `.bind()` on RPC stub methods. Just use the property reference directly:
```js
// BAD — interpreted as a remote call to a method named "bind"
const fn = env.API.method.bind(env.API);

// GOOD — direct property access works as a callable
const fn = env.API.method;

// ALSO GOOD — if you absolutely need bind, force the JS-level operation
const fn = Function.prototype.bind.call(env.API.method, env.API);
```
In this codebase the offending site was `apps/api/src/durableObjects/lib/classProxy.ts:54` (`safeDevice` Proxy returning `target[prop].bind(target)`). Confirmed by Cloudflare runtime team.
**How to confirm**: minimum repro lives at `~/projects/servicestub-repro/` and at `https://servicestub-repro.huckye.workers.dev/`. The response shows all three forms side-by-side: direct + `Function.prototype.bind.call` succeed, `.bind()` fails.

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

### ESP32-C3 0.42″ 72×40 OLED renders interleaved horizontal stripes instead of the framebuffer
**Date**: 2026-04-24
**Question/Problem**: After `display_init_ssd1306` + a full-framebuffer write, the panel shows stripes in one half of the display and a solid band of "bleed-through" in the other half, even when the framebuffer is all-`0xFF`. A diagnostic write where only page 0 is `0xFF` lights a band in the *wrong* region (a fraction of the bottom half) instead of the top 8 rows.
**Root Cause**: The 0.42" 72×40 OLED (sold as "ESP32-C3-FN4 with 0.42 OLED", common AliExpress board) wires the SSD1306's 40 active COM pins with **alternating / interleaved mapping**, so COM0/2/4/… drive one set of rows and COM1/3/5/… drive the other. The init code had `uint8_t com_pins = (height == 64) ? 0x12 : 0x02;` — sequential (`0x02`) for anything non-64-row — which is right for 128×32 panels but wrong for 128×64 *and* for these 72×40 panels.
**Solution**: Invert the default: use `0x12` (alternating, no COM remap) unless the height is specifically 32. Change in `firmware/esp32/main/display.c:53`:
```c
uint8_t com_pins = (height == 32) ? 0x02 : 0x12;
```
**Rule**: For any new SSD1306-family panel that isn't the canonical 128×32, expect alternating COM pins. The clue that you have the wrong config is diagnostic patterns that show up as every-other-row stripes, not as rectangles.

### `devicesdk logs --tail` exits / fails behind a corporate proxy
**Date**: 2026-05-01
**Question/Problem**: Since May 2026 the CLI `logs` and `logs --tail` commands open a WebSocket to `/v1/projects/.../devices/.../watch` instead of polling the deprecated `/logs` HTTP endpoint. Some corporate proxies strip the `Upgrade: websocket` header or block 101 responses, leaving the CLI unable to connect.
**Root Cause**: The deprecation removed the HTTP polling fallback. The watcher endpoint is the only path that delivers logs.
**Solution**: Open the dashboard (`https://dash.devicesdk.com/projects/<slug>/devices/<slug>`) — the logs panel uses the same WebSocket and works in any browser the user can already reach. If neither WS nor the dashboard is reachable, raise the issue with the network operator (the watcher socket is required for the runtime UI). Do **not** reintroduce a polling fallback — the burn pattern that triggered the migration would recur.

### Firmware R2 upload fails with "The file … does not exist" in CI
**Date**: 2026-05-29
**Question/Problem**: The `upload-to-r2` job in `firmware-esp32.yml` / `firmware-pico.yml` failed with `✘ [ERROR] The file "firmware/<name>" does not exist`, even though the previous `download-artifact` step succeeded. The pnpm error context showed the failing command ran in `apps/api`.
**Root Cause**: The upload step uses `pnpm --filter @devicesdk/api exec wrangler …` to get the workspace's pinned wrangler. **`pnpm --filter <pkg> exec` runs the command with CWD set to that package's directory** (`apps/api`), not the repo root. wrangler resolves `--file` relative to its CWD, so a *relative* `--file=firmware/<name>` was looked up at `apps/api/firmware/<name>`. But `download-artifact`'s `path:` is relative to `$GITHUB_WORKSPACE`, so the binary actually landed at the repo-root `firmware/`. (The R2 object key — the first positional arg — is just a string and is unaffected.)
**Solution**: Anchor `--file` to the workspace root: `--file="$GITHUB_WORKSPACE/firmware/<name>"`. Keeps the pinned-wrangler-via-filter intent; only the path is made absolute.
**Rule**: Any CI step that invokes a tool via `pnpm --filter <pkg> exec` and passes a path argument must use an absolute path (or `cd $GITHUB_WORKSPACE` first). Relative paths silently bind to the filtered package's dir, not where you ran the step from.

### Pico firmware: host tests pass but real hardware command responses/reads fail
**Date**: 2026-05-30
**Question/Problem**: Pico unit tests were green, yet on real hardware command acks never reached the server (every command timed out after 5s) and `i2c_read`/`spi_read`/`uart_read` were rejected as "missing parameter".
**Root Cause**: Two compounding issues. (1) The Pico has **two parallel command implementations**: the standalone handlers in `src/commands/*.cpp` (which the host tests in `test/` actually exercise, and which were already contract-correct) and the **inline production path** in `src/websocket_handler.cpp` (parsing) + `main.cpp` (response building) which is what actually runs on device for scan/read/write. The tests covered the *correct* copy, so the broken production copy went unnoticed. (2) `lib/lwip_ws/ws_client.cpp`'s `build_frame()` only emitted the 7-bit WebSocket length, returning 0 (silent drop) for any payload ≥126 bytes — and a `command_ack` carrying the server's 36-char `id` is ~132 bytes, so essentially every ack/read-result was dropped before transmission.
**Solution**: (1) Fixed the inline production path to match the contract in `packages/core` (`bytes_to_read`/`register_to_read`; `addresses_found`; hex-string `data` arrays) — same change PR #128 made for ESP32. (2) Added 16-bit extended-length framing to `build_frame` and bumped `BUF_SIZE` to 4096. Also fixed a use-after-free in `tcp_err_callback` (lwIP frees the pcb before the err callback — must not `altcp_close` it) and an out-of-bounds `erase` in `process_rx_buffer` after a Close frame clears the rx buffer.
**Rule**: When auditing/altering Pico command behaviour, the **device runs the inline path in `websocket_handler.cpp` + `main.cpp`**, not the `src/commands/*.cpp` handlers (those are wired into the host test harness via the `UNIT_TEST` dispatcher, plus `i2c_batch_write`/`display_update` in production). Verify both, and remember the wire contract's source of truth is `apps/api/src/durableObjects/lib/deviceSender.ts` + `packages/core/src/{commands,responses}.ts`.

### Per-device clock "goes dark after ~1–2h" — Cloudflare free-tier limits, not (only) a code bug
**Date**: 2026-06-05
**Question/Problem**: The ESP32-C3 OLED clock (`examples/esp32c3-clock`, a `* * * * *` cron that redraws every minute) repeatedly worked for ~1–2 hours then went dark / froze on a stale time / got stuck on the firmware "Connected" screen, and the device reconnected on a loop. Several rounds of fixes each *improved* it (longer uptime) but it kept recurring.
**Root Cause**: Three distinct failures stacked on top of each other; the deepest two are **Cloudflare free-tier account quotas**, not application logic:
1. **Display init regression (app):** the firmware (PR #133) repaints "Server"/"Connected" status to the *same* OLED on every WebSocket (dis)connect, re-running the SSD1306 power-on. PR #136 had stripped the `displayInitialized` tracking and made `onCron` send `init:false`, so any missed/clobbered one-shot init left the panel writing pixels to an un-initialized controller → nothing rendered until reboot. Fix: every cloud draw re-initializes the panel (`init:true`) — `examples/esp32c3-clock/src/devices/clock.ts`, PR #147.
2. **Worker Loader isolate leak (`Too many concurrent dynamic workers`):** `getOrCreateUserWorker` re-resolves the user worker every DO invocation (the PR #140 stale-stub workaround) via `env.LOADER.get(id, …).getEntrypoint(…).getTarget()`. The returned `WorkerStub` **and** the `getTarget()` result are child-isolate handles; dropping them relies on GC, which lags badly under a per-minute cron, so isolates pile up until `LOADER.get()` throws `Too many concurrent dynamic workers`. Then every `onCron`/`onDeviceConnect` fails, each failed init burns the ~60s wall, and the starved WebSocket reconnect-loops. Fix: dispose **both** the handle and the target stub (`Symbol.dispose`) at every invocation entry point that re-resolves (`releaseCachedUserWorker` in `device.ts`) — PR #148 (handle) + #150 (target stub). This is the `using`-style lifecycle the Worker Loader expects.
3. **Durable Objects free-tier write quota (`Exceeded allowed rows written in Durable Objects free tier`):** the reconnect churn from (2) — amplified massively by **operator debugging resets** (each `esptool` reset triggers a reconnect write-storm) — exhausts the **account-level** daily DO "rows written" allowance. Once exhausted, *every* `storage.put`/`get`/`setAlarm`/`acceptWebSocket` throws, so the DO can't accept WebSockets at all → the device reconnects every ~6s, each retry attempts more writes, and the quota stays pinned. This is **not code-fixable**: `acceptWebSocket` itself requires a write. It clears only on the Cloudflare daily reset or by upgrading the account to **Workers Paid**.
**Solution / Rules**:
- The recurrent "dark device" is fundamentally **the per-device-per-minute-cron architecture straining Cloudflare free-tier caps** (Worker Loader concurrency + DO row-writes). On free tier, even with the code fixes, sustained churn (or heavy debugging) re-exhausts the daily quota. **Definitive fix: Workers Paid.** Cheaper mitigation: keep the device *stably connected* (fix the wedge so it doesn't churn) — steady-state writes (~2–3/min) fit free tier; the churn is what kills it.
- **Do NOT brute-force-reset a struggling device to "recover" it.** Each `esptool` reset / reconnect spends DO write quota (and the per-device 500/day message budget). Dozens of resets will exhaust the daily account quota and *cause* the dark-loop you're trying to debug. Diagnose from `wrangler tail` instead.
- **Diagnosis method:** `wrangler tail --env production --format json`. Decode `event.exceptions[].message` + `.stack` — the exact CF limit string (`Too many concurrent dynamic workers` vs `Exceeded allowed rows written…`) tells you which cap you hit. `connect-fetch` outcomes of `503`/`exception` with a tight ~6s reconnect cadence = the DO can't service upgrades (jammed or quota-exhausted). A frozen `Date.now()` + ~60s wall = subrequest fan-out (stale stub). See `.claude/skills/debug-prod-worker-wedge`.
- **`connected=1`/`=0` in D1 is a cosmetic cache, not authoritative** — a stale flag can disagree with reality; `getWebSockets("device")` (and whether cron draws are flowing in `tail`) is the truth.
- Connect-path DO writes (`deviceMeta`, `connectedSince`, the `connected=1` D1 cache) are now **best-effort** (`safeStoragePut` + try/catch) so a transient/quota write error degrades instead of failing the upgrade and amplifying churn (PR #150). This does *not* let a fully quota-exhausted DO connect (acceptWebSocket still writes) — it only reduces blast radius.

### workers-qb `trimQuery` corrupts SQL containing `--` comments
**Date**: 2026-06-09
**Question/Problem**: Applying the migration files through workers-qb's `asyncMigrationsBuilder` failed with `near ")": syntax error`, but every file ran fine via `db.exec()` directly.
**Root Cause**: Every workers-qb `Query` runs `trimQuery()` (`query.replace(/\s\s+/g, " ")`). A line like `-- comment` followed by an indented line collapses `newline+indent` into one space, so the comment swallows the SQL after it; whatever survives is syntactically broken. Any SQL containing `--` comments is unsafe to route through a workers-qb Query object.
**Solution**: `apps/server/src/db/migrate.ts` is a custom runner that calls `db.exec(rawSql)` per file (multi-statement capable, preserves bytes) and tracks applied names in a `migrations` table. Never feed migration files (or any commented SQL) through `qb.raw(...)`.

### bun:sqlite: `db.query()` prepares ONE statement; use `db.exec()` for multi-statement SQL
**Date**: 2026-06-09
**Question/Problem**: Multi-statement strings (e.g. `CREATE TABLE ...; CREATE INDEX ...;`) failed or silently truncated when run through `db.query(...).run()`.
**Root Cause**: `Database.query()` compiles a single statement (sqlite3_prepare semantics). `db.exec()` executes the whole string.
**Solution**: `BunSqliteQB` routes argument-less non-SELECT queries through `db.exec`; anything with bound args uses a prepared statement (single statement is fine there — app queries are single statements).

### hono `createBunWebSocket` upgrades silently fail without the server handle in c.env
**Date**: 2026-06-09
**Question/Problem**: `upgradeWebSocket` threw `'server.upgrade' is undefined` when `Bun.serve`'s fetch passed a custom services object as Hono's env.
**Root Cause**: hono's bun adapter resolves the Bun server from `c.env.server` (or `c.env` itself) to call `server.upgrade()`. Passing an arbitrary services object hides it. Also, the `upgradeWebSocket`/`websocket` pair must come from ONE `createBunWebSocket()` call shared between route registration and `Bun.serve` — two instances never connect.
**Solution**: `apps/server/src/ws.ts` exports the singleton; `server.ts` assigns `services.server = server` right after `Bun.serve()` returns (`Env.server` field).

### Per-device console capture without isolation: AsyncLocalStorage
**Date**: 2026-06-09
**Question/Problem**: User scripts share the server process, but their `console.log` output must land in per-device logs (the old sandboxed worker overrode console per isolate).
**Root Cause**: One global console, many devices — the only per-call routing signal is async context.
**Solution**: `runtime/consoleCapture.ts` patches console once and reads the active sink from `AsyncLocalStorage`; every user-handler dispatch runs inside `runWithLogCapture(session, fn)`. Critical detail: `foundation/logger.ts` binds the ORIGINAL console functions at module load (before the patch installs) so server-side logs are never captured into device logs and the capture path can't recurse.
