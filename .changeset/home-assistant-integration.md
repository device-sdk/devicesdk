---
"@devicesdk/core": minor
"@devicesdk/api": minor
"@devicesdk/cli": minor
---

Add Home Assistant integration support across the stack:

- **Generic watch WebSocket** (`GET /v1/projects/:projectId/devices/:deviceId/watch`) delivers real-time `status`, `log`, and structured `state` events over a single hibernation-friendly connection. Replaces the legacy SSE log stream as the canonical real-time primitive. The dashboard now uses this endpoint.
- **`emitState(entityId, value)` SDK method** on `DeviceSenderInterface` lets device scripts publish structured telemetry to watchers (custom sensors, I2C readings, derived values).
- **Auto-emitted state events** for built-in hardware messages: `gpio_state_changed`, `pin_state_update`, and `temperature_result` are broadcast as structured `state` events without requiring `emitState` calls.
- **`HaEntityDeclaration` types** in `@devicesdk/core` for declaring Home Assistant entities.
- **`ha.entities` config key** in `devicesdk.ts` — the CLI's `deploy` command uploads these declarations to the new `GET/PUT /entities` endpoints after a successful script push.
