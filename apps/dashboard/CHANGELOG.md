# @devicesdk/dashboard

## 0.1.1

### Patch Changes

- fe1bad8: Replace stub script templates in the dashboard with working examples covering blink, temperature monitoring, I2C sensor reading, PWM motor control, button LED toggle, and GPIO input monitoring.

## 0.1.0

### Minor Changes

- bc3493a: Add device logging pipeline: console.log/info/warn/error/debug in user device scripts are automatically captured, persisted to per-device storage, served via GET /v1/.../logs endpoint, and displayed in dashboard Logs tab.

  Breaking: removed `LoggerInterface` and `LOGGER` from `UserWorkerEnv` in `@devicesdk/core`. Use `console.log`/`console.info`/etc. instead of `this.env.LOGGER.info()` — logging is now handled transparently via console override.
