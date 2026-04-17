---
"@devicesdk/api": patch
"@devicesdk/cli": patch
---

- Extract duplicate project+device lookup into `foundation/projectDeviceResolve.ts`, used by `getDevice`, `updateDevice`, `deleteDevice`, `sendCommand`, and `watchDevice`.
- Centralize dashboard API host in `config/apiHost.ts` with a `VITE_API_HOST` env override; four call sites now read from one source.
- Add `DEVICESDK_SIMULATOR_ASSETS_PATH` env override for `devicesdk dev` when the packaged simulator assets are unavailable.
- Introduce canonical CLI exit code constants (`packages/cli/src/exitCodes.ts`) and document them in `docs/cli/_index.md`. All 48 `process.exit()` call sites now use named constants.
- Remove order-dependent 403-retry pattern in `limits.test.ts` by resetting the free user's projects in `beforeEach`.
- Deduplicate firmware base64 primitives into a shared header-only `firmware/common/base64_core.h` used by both the ESP32 (C) and Pico (C++) implementations.
- Delete the orphaned `firmware/pico/lib/lwip_ws/ws_client.c` stub (the real implementation lives in `ws_client.cpp`).
