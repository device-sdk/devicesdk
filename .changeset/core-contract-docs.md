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
- `PROJECT_ID_REGEX` and `DEVICE_ID_REGEX` now accept exactly what the server
  accepts for slugs: 1..36 chars (was 3..64). The old window was wrong on both
  ends: 1- and 2-char slugs were rejected even though the server accepts them,
  while 37..64-char values passed validation but were always rejected by the
  server (`createProject`/`createDevice` use `^[a-z][a-z0-9-]{0,35}$`). The
  regexes now mirror the server contract.
