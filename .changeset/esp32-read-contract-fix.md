---
"@devicesdk/firmware-esp32": patch
---

Fix ESP32 firmware WebSocket contract for read-back commands. `i2c_read`,
`spi_read`, and `uart_read` parsed the wrong payload field (`length` instead of
`bytes_to_read`), and `i2c_read` read `register` as a number instead of the
hex-string `register_to_read` — so these commands were silently dropped on real
hardware and the server timed out after 5s. The `i2c_read_result` and
`i2c_scan_result` responses now emit the contract shapes (`data: string[]` /
`addresses_found: string[]`). Bumping the firmware package triggers a new build
and prod firmware deploy.
