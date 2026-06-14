---
"@devicesdk/server": patch
---

Add a Bun FileSink-backed server logger with size-based rotation and inject it into runtime classes.

- `ServerLogger` is a global singleton that writes JSON log lines to `DATA_DIR/server.log` (override via `LOG_FILE`).
- Logs are flushed after each write and rotated when the file exceeds 10 MiB (configurable via constructor options; kept up to 5 backups).
- `DeviceHub` and `DeviceSession` now receive the logger through constructor injection.
- Replaced the stray `console.debug` in `getDeviceConnectionStatus` with the new logger.
