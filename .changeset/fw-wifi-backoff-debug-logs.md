---
"@devicesdk/firmware-esp32": patch
"@devicesdk/firmware-pico": patch
---

WiFi reconnect now uses exponential backoff (1s doubling up to 30s, plus jitter) instead of retrying immediately on every disconnect, so a flaky link no longer amplifies into a reconnect storm. Both platforms log the disconnect reason, advertise the device slug as the DHCP hostname so routers show a readable name instead of the vendor default, and log the WebSocket URL plus only the last 4 characters of the API token on connect. IP/RSSI and human-readable transport errors are now logged too, making flaky-link and routing issues diagnosable from the serial log alone.

Firmware release pipeline: GitHub Releases are now created only when the changeset "Version packages" PR bumps the firmware version, checked against existing release tags so a cancelled or failed publish self-heals on the next firmware push, and the release notes now carry the changeset changelog section for that version instead of a static one-liner.
