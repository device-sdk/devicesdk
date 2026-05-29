---
"@devicesdk/api": patch
---

Fix per-device cron schedules permanently stopping after a connection blip. The cost guard added in #111 cancels a device's Durable Object alarm whenever it fires with no device socket present, and the only path that re-armed it was `initializeCrons()` — which runs only after a fresh `device_connected` handshake is drained. A device whose WebSocket was re-established at the transport level without re-sending that handshake (or a half-open connection the runtime later replaces) was left with its cron dead forever, even while the device still reported as connected. The device connect handler now re-arms the cron alarm from the persisted schedule on every WebSocket accept (`rearmCronAlarmFromStorage()`), independent of the handshake, skipping any fire time that elapsed while offline.
