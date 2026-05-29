# @devicesdk/firmware-pico

## 0.0.4

### Patch Changes

- f4e26bd: Cut a new firmware release for Pico and ESP32. No functional firmware changes — this entry bumps the firmware package versions so the "version packages" PR's `package.json` edits trip the path-filtered firmware workflows and rebuild/republish the binaries to R2. This release picks up the repaired R2 upload step (the `--file` path is now anchored to `$GITHUB_WORKSPACE` so `pnpm --filter … exec`'s `apps/api` CWD no longer breaks the upload).

## 0.0.3

### Patch Changes

- 48a3bf9: Cut a new firmware release for ESP32 and Pico. No functional firmware changes — this entry bumps the firmware package versions so the release pipeline rebuilds and republishes the binaries to R2. For ESP32 this picks up the fixed CI pipeline (single-job multi-target build + repaired R2 upload); the previous run built the ESP32 binaries but failed to upload them.

## 0.0.2

### Patch Changes

- 6495035: Cut a new firmware release. No functional firmware changes — this entry exists to bump the Pico and ESP32 firmware package versions so the release pipeline rebuilds and republishes the binaries.
