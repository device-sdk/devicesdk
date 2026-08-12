---
"@devicesdk/firmware-esp32": minor
"@devicesdk/firmware-pico": minor
---

Both firmware platforms now embed their release version and device type at build time (from `firmware/*/package.json`) and report them to the server in the `device_connected` handshake, so the API/CLI/dashboard can display the firmware version a device is running. Firmware built before this change reports no version and is shown as "unknown" (fully backward compatible).
