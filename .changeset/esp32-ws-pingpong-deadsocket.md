---
"@devicesdk/firmware-esp32": patch
---

ESP32: detect half-open WebSocket connections and auto-reconnect. The client now
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
