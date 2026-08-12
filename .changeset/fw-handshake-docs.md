---
"@devicesdk/docs": patch
---

Document the firmware version handshake: devices report their firmware version and device type, visible in `devicesdk status`, the dashboard, and the API; firmware predating version reporting shows as unknown, and the DHT/1-Wire commands fail fast with a reflash error when the device firmware is known to be too old.
