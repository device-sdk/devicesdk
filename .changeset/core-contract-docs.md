---
"@devicesdk/core": patch
---

Correct the published contract documentation and export the `RemoteDevices`
type:

- The `DeviceSenderInterface` docs previously promised an offline command
  queue ("commands are queued and delivered on reconnect"). No queue exists:
  void sends throw and response-awaiting sends reject while the device is
  offline. The JSDoc now states this plainly, including guidance for commands
  issued right after `reboot()`
- `RemoteDevices` is now exported (per-device RPC mapping companion to the
  existing `RemoteDevice` type)
- Branded id helpers (`asProjectId`, `asDeviceId`) now report the actual slug
  format on failure and reject non-string input with a clear `TypeError`
