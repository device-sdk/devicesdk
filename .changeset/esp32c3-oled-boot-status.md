---
"@devicesdk/api": patch
"@devicesdk/core": patch
"@devicesdk/website": patch
---

ESP32-C3 0.42″ OLED ergonomics + local-dev fixes:

- **firmware/esp32**: paint boot status (`Booting` → `WiFi` → `Server`) on the on-board OLED for FN4 / "0.42 OLED" boards. The firmware probes `0x3C` at boot via `i2c_master_probe`; boards without an OLED (DevKitM-1) get a fast NACK and silently skip. Replaces the WS2812-only feedback that was invisible on FN4 boards (no LED wired to GPIO 8).
- **firmware/esp32**: detect plain-HTTP local API hosts (`<lan-ip>:<port>`) and dial `ws://` instead of `wss://`, so flashing against `localhost:8787` works without a TLS cert.
- **@devicesdk/api**: throw an explicit error from the `/v1/auth/google` route when `GOOGLE_ID`/`GOOGLE_SECRET` are missing — Sentry captures the misconfiguration cleanly instead of returning a generic chanfana validation error.
- **@devicesdk/core**: update `columnOffset` comments to point at `28` (most common on FN4 0.42″ boards) and note `30`/`32` variants exist.
- **@devicesdk/website**: document `columnOffset: 28` for the 0.42″ 72×40 panel and add a troubleshooting note for the leftmost vertical-stripe artifact (panel-offset mismatch / stale RAM).
