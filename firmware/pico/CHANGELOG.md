# @devicesdk/firmware-pico

## 0.0.3

### Patch Changes

- 48a3bf9: Cut a new firmware release for ESP32 and Pico. No functional firmware changes — this entry bumps the firmware package versions so the release pipeline rebuilds and republishes the binaries to R2. For ESP32 this picks up the fixed CI pipeline (single-job multi-target build + repaired R2 upload); the previous run built the ESP32 binaries but failed to upload them.

## 0.0.2

### Patch Changes

- 6495035: Cut a new firmware release. No functional firmware changes — this entry exists to bump the Pico and ESP32 firmware package versions so the release pipeline rebuilds and republishes the binaries.
