---
"@devicesdk/firmware-esp32": patch
"@devicesdk/server": patch
---

Fix a hard crash that bricked single-core ESP32 targets (ESP32-C3/C61): the worker task was created pinned to core 1, but on single-core chips `xTaskCreatePinnedToCore` asserts on any core ID other than 0 (ESP-IDF FreeRTOS, `freertos_tasks_c_additions.h:163`). The task creation runs right after `wifi_init_sta()` on every boot, so a device that failed its first WiFi attempt crashed into a permanent reboot loop before the WiFi backoff retry could fire (observed as a crash immediately after `wifi disconnected, reason=2` + `Failed to connect`). The task is now pinned to `configNUM_CORES - 1` (APP_CPU on dual-core ESP32, core 0 on single-core parts), preserving the DHT bit-bang isolation on dual-core while letting single-core targets boot and retry.
