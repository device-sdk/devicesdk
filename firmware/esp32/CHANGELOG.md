# @devicesdk/firmware-esp32

## 0.0.5

### Patch Changes

- 3fc55a4: Fix ESP32 firmware WebSocket contract for read-back commands. `i2c_read`,
  `spi_read`, and `uart_read` parsed the wrong payload field (`length` instead of
  `bytes_to_read`), and `i2c_read` read `register` as a number instead of the
  hex-string `register_to_read` — so these commands were silently dropped on real
  hardware and the server timed out after 5s. The `i2c_read_result` and
  `i2c_scan_result` responses now emit the contract shapes (`data: string[]` /
  `addresses_found: string[]`). Bumping the firmware package triggers a new build
  and prod firmware deploy.
- 1c8a770: ESP32: detect half-open WebSocket connections and auto-reconnect. The client now
  enables protocol-level WebSocket PING/PONG (`ping_interval_sec` / `pingpong_timeout_sec`)
  plus TCP keep-alive. Previously the only keepalive was a fire-and-forget app-level
  `{"type":"ping"}` text frame the server never replies to, so a half-open TCP drop
  (home-router/NAT idle timeout, ~15 min) went unnoticed: the device kept believing it
  was connected, never reconnected, and the server's connection-gated per-device cron
  alarm stayed cancelled forever — the device showed `● online` while its cron/clock
  froze. With protocol ping/pong, a missing PONG (the runtime PONGs every PING for free
  without waking the hibernating server object) now tears the dead connection down and
  triggers auto-reconnect, which re-sends `device_connected` and re-arms the cron. The
  steady ping traffic also keeps NAT mappings warm, avoiding the idle drop in the first
  place. Closes the firmware side of the "cron stops after ~15 min while still online"
  issue for ESP32 (esp32 / esp32c3 / esp32c61); Pico's raw-lwIP client is tracked
  separately.

## 0.0.4

### Patch Changes

- f4e26bd: Cut a new firmware release for Pico and ESP32. No functional firmware changes — this entry bumps the firmware package versions so the "version packages" PR's `package.json` edits trip the path-filtered firmware workflows and rebuild/republish the binaries to R2. This release picks up the repaired R2 upload step (the `--file` path is now anchored to `$GITHUB_WORKSPACE` so `pnpm --filter … exec`'s `apps/api` CWD no longer breaks the upload).

## 0.0.3

### Patch Changes

- 48a3bf9: Cut a new firmware release for ESP32 and Pico. No functional firmware changes — this entry bumps the firmware package versions so the release pipeline rebuilds and republishes the binaries to R2. For ESP32 this picks up the fixed CI pipeline (single-job multi-target build + repaired R2 upload); the previous run built the ESP32 binaries but failed to upload them.

## 0.0.2

### Patch Changes

- 6495035: Cut a new firmware release. No functional firmware changes — this entry exists to bump the Pico and ESP32 firmware package versions so the release pipeline rebuilds and republishes the binaries.
