---
"@devicesdk/api": patch
---

Recalculate ESP-IDF image checksum for ESP32-C3 firmware downloads. Previously only `esp32` and `esp32c61` had their checksums recalculated after credential patching, so credential-patched `esp32c3` binaries carried stale checksums and would fail image validation at boot. The condition now covers every `esp32*` variant.
