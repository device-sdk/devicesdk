---
"@devicesdk/api": patch
---

fix(api): defer device `onDeviceDisconnect` to the alarm queue so a reconnect after a disconnect is never wedged

`handleConnectionLost` (called from the Hibernation-API `webSocketClose` / `webSocketError` handlers) invoked the Worker Loader inline — `getOrCreateUserWorker()` plus `onDeviceDisconnect()`. Invoking the Worker Loader from a Hibernation-API handler hangs in production and wedged the device's dynamic-worker slot, so after a device disconnected and reconnected it completed the WebSocket handshake but never received another command (ESP32 stuck on the "Server" screen after a disconnect/reconnect cycle). The disconnect lifecycle hook is now dispatched through the same alarm-drained user-event queue as `onDeviceConnect` / `onMessage`, so the close handler only does cheap storage work and the next connect is always served.
