---
"@devicesdk/firmware-pico": patch
---

Fix Pico firmware WebSocket memory-safety bugs and read-back command contract.

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
