---
name: devicesdk-firmware
description: DeviceSDK firmware runs on Raspberry Pi Pico W (RP2040) and the ESP32 family (including ESP32-C61). Devices open a raw WebSocket to the managed runtime, receive commands, and stream status/log/state events back. Flashing is typically a one-time operation; subsequent updates are delivered over the air.
---

## Supported hardware
- **Raspberry Pi Pico W** — RP2040 dual Cortex-M0+, 264 KB RAM, 2 MB flash, Wi-Fi via CYW43439. Full HAL: GPIO, PWM, ADC, I2C, SPI, UART. Virtual pin `99` is the onboard LED.
- **ESP32 family (C3, S3, C6, C61, …)** — built with ESP-IDF 5.5.2. Same HAL plus addressable-LED support (WS2812) via the `led_strip` component. ESP32-C61 has no RMT peripheral, so it uses the SPI backend; onboard LED is WS2812 on GPIO 8.

## Flashing
**Pico** (device in BOOTSEL mode; a `RPI-RP2` or `RP2350` volume mounts):
```bash
devicesdk flash my-pico
```

**ESP32** — build from source to avoid merged-binary checksum issues:
```bash
cd firmware/esp32 && source ~/esp/esp-idf/export.sh
idf.py build
python -m esptool --chip esp32c61 -b 460800 \
  write_flash 0x0 build/bootloader/bootloader.bin \
              0x8000 build/partition_table/partition-table.bin \
              0x10000 build/iotkit-client.bin
```

## Credentials
Wi-Fi SSID, password, and the device API token are embedded into the firmware image at flash time.

## See also
- Hardware compatibility matrix: <https://devicesdk.com/docs/resources/hardware>
- Troubleshooting: <https://devicesdk.com/docs/resources/troubleshooting>
