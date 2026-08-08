---
"@devicesdk/firmware-pico": patch
---

- Dead-socket detection: protocol-level PING every 60s, PONG replies, and a
  180s receive timeout close the connection after silent NAT idle drops
  (previously the device stayed "connected" forever with crons cancelled)
- TLS now verifies the server hostname (any certificate chaining to the pinned
  CA was previously accepted); handshake validates the random key + SHA1/GUID
  accept and the HTTP status line
- Command parsing moved off the lwIP receive callback (was ~5.7 KB of stack on
  the 2 KB CYW43 task; blocking I2C could stall all TCP processing)
- Display segment offsets validated before copy (integer-wrap overflow);
  GPIO input monitoring actually stops when disabled
- SPI/UART oversized requests are rejected instead of silently truncated;
  responses match `@devicesdk/core` (bus/port fields)
- Stops reconnecting after 5 consecutive 401 handshakes; no more `std::stoi`
  crash on malformed host ports; stale queued frames are dropped on close
