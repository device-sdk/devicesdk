---
"@devicesdk/firmware-esp32": patch
"@devicesdk/firmware-pico": patch
---

Switch firmware workflows from rolling releases to versioned releases.

- `firmware-esp32.yml` and `firmware-pico.yml` now detect whether the firmware package version changed relative to the previous `main` commit and only publish a GitHub Release when bumped (or on `workflow_dispatch`).
- Each publish creates a unique tag (`firmware-esp32@vX.Y.Z`, `firmware-pico@vX.Y.Z`) instead of recreating rolling tags, avoiding immutable-release / tag-creation rule failures.
- The Dockerfile queries the GitHub API for the latest versioned release per firmware family and downloads from it.
