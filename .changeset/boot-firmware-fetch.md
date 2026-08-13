---
"@devicesdk/server": patch
---

The server now fetches the exact firmware release it was built against at boot instead of relying on firmware binaries baked into the Docker image. `@devicesdk/server` depends on `@devicesdk/firmware-esp32` and `@devicesdk/firmware-pico` (`workspace:*`), so the changeset version bump keeps the pinned firmware in lockstep with the server; at boot the server downloads exactly those release versions into the firmware store (`foundation/firmwareSync.ts`), best-effort, idempotent, and never blocking boot. The Docker image is no longer published until the firmware releases it pins exist (docker.yml waits for them and fails on timeout), so a pulled image never 404s on first boot. A freshly built image therefore always serves the firmware release it shipped with, instead of racing the firmware build and bundling the previous release. Existing deployments keep the firmware version their image pins.
