---
"@devicesdk/firmware-pico": patch
"@devicesdk/firmware-esp32": patch
---

Cut a new firmware release for ESP32 and Pico. No functional firmware changes — this entry bumps the firmware package versions so the release pipeline rebuilds and republishes the binaries to R2. For ESP32 this picks up the fixed CI pipeline (single-job multi-target build + repaired R2 upload); the previous run built the ESP32 binaries but failed to upload them.
