# @devicesdk/firmware-pico

## 0.0.5

### Patch Changes

- d1d32e2: Fix Pico firmware WebSocket memory-safety bugs and read-back command contract.

  Memory safety (`lib/lwip_ws/ws_client.cpp`): `build_frame` now emits the 16-bit
  extended length, so frames ≥126 bytes (nearly every `command_ack`, which carries
  the server's 36-char id) are no longer silently dropped; the TCP error callback
  no longer calls `altcp_close()` on the already-freed pcb (use-after-free on
  RST/drop/reboot); and the rx loop no longer erases past the buffer end after a
  Close frame (including the rate-limit close). `handle_spi_transfer` guards the
  copy into the 256-byte response buffer.

  Contract: the production inline path now reads `bytes_to_read` (not `length`) and
  the hex-string `register_to_read` (not numeric `register`) for `i2c_read` /
  `spi_read` / `uart_read`, and `i2c_scan_result` / `i2c_read_result` emit the
  contract shapes (`addresses_found` / hex-string `data` arrays). Bumping the
  firmware package triggers a new build and prod firmware deploy.

## 0.0.4

### Patch Changes

- f4e26bd: Cut a new firmware release for Pico and ESP32. No functional firmware changes — this entry bumps the firmware package versions so the "version packages" PR's `package.json` edits trip the path-filtered firmware workflows and rebuild/republish the binaries to R2. This release picks up the repaired R2 upload step (the `--file` path is now anchored to `$GITHUB_WORKSPACE` so `pnpm --filter … exec`'s `apps/api` CWD no longer breaks the upload).

## 0.0.3

### Patch Changes

- 48a3bf9: Cut a new firmware release for ESP32 and Pico. No functional firmware changes — this entry bumps the firmware package versions so the release pipeline rebuilds and republishes the binaries to R2. For ESP32 this picks up the fixed CI pipeline (single-job multi-target build + repaired R2 upload); the previous run built the ESP32 binaries but failed to upload them.

## 0.0.2

### Patch Changes

- 6495035: Cut a new firmware release. No functional firmware changes — this entry exists to bump the Pico and ESP32 firmware package versions so the release pipeline rebuilds and republishes the binaries.
