---
"@devicesdk/server": minor
---

Firmware version handshake: the server now parses `firmware_version`/`device_type` from the device `device_connected` payload, persists the last known values, and exposes them in the device GET/status/list endpoints and the watcher status event. Script commands that need newer firmware (`dht_read`, `onewire_search`, `onewire_read_temp`) now fail fast with an actionable reflash error when the device's reported firmware is known to be too old, instead of timing out after 5 seconds. Devices on firmware that does not report a version keep working unchanged.
