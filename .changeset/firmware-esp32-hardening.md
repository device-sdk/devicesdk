---
"@devicesdk/firmware-esp32": patch
---

- Fix a remotely reachable out-of-bounds array write in the PWM path: pin
  values >= `GPIO_NUM_MAX` are rejected before `ledc_channel_map` is indexed
  (was corrupting adjacent driver state)
- WebSocket frames larger than 2 KB are now reassembled (the server allows
  4 KB command payloads; oversized frames were silently dropped)
- Display update segments are validated against the framebuffer before copy
  (integer-wrap could overflow the buffer with a malformed offset)
- Unknown/malformed commands and I2C batch errors now answer `command_error`
  instead of letting the server time out; strict hex parsing with address
  range validation
- GPIO input monitoring actually stops when disabled (with ack)
- WiFi reconnect uses bounded backoff and the client stops retrying after 5
  consecutive 401 handshakes (re-flash with a valid token)
- Response contract aligned with `@devicesdk/core`: SPI responses carry `bus`,
  UART read responses carry `port`, the non-contractual `length` field was
  removed; virtual pin 99 (onboard LED) works on plain-GPIO boards
