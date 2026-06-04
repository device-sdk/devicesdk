---
"@devicesdk/api": patch
---

Enforce a single live device session per Durable Object. When a device lost power, its WebSocket could linger as a half-open "ghost" socket until the Hibernation runtime reaped it — which can lag the device's own reboot. If the device reconnected before the ghost was reaped, the DO held two `"device"` sockets and command dispatch could target the dead one, leaving the freshly-rebooted device stuck on the "Server" screen (its display frames never arrived). The device-connect handler now closes any existing device socket (close code `4001`) before accepting the replacement, and `getSession()` prefers an OPEN socket over a lingering closing one.
