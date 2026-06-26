---
title: Hardware Compatibility
description: Supported microcontrollers and hardware platforms
aliases:
  - /docs/resources/hardware/
social_image: /og-images/docs/hardware.png
---

DeviceSDK runs on low-cost WiFi-capable microcontrollers. Pick the board closest to your project and open its page for pinout, feature support, and flashing notes.

## Supported boards

- [**Raspberry Pi Pico W**](/docs/hardware/pico-w/) - RP2040 dual Cortex-M0+, 2.4GHz WiFi. Full support.
- [**Raspberry Pi Pico 2W**](/docs/hardware/pico-2w/) - RP2350 dual Cortex-M33, 2.4GHz WiFi. Full support, Pico W pin-compatible.
- [**ESP32**](/docs/hardware/esp32/) - classic dual Xtensa LX6, 2.4GHz WiFi. Full support.
- [**ESP32-C3**](/docs/hardware/esp32-c3/) - single-core RISC-V, 2.4GHz WiFi. Full support.
- [**ESP32-C61**](/docs/hardware/esp32-c61/) - single-core RISC-V, 2.4GHz WiFi 6. Full support.

## Feature support matrix

| Feature | Pico W | Pico 2W | ESP32 | ESP32-C3 | ESP32-C61 |
|---|:-:|:-:|:-:|:-:|:-:|
| GPIO digital I/O | ✅ | ✅ | ✅ | ✅ | ✅ |
| GPIO input monitoring | ✅ | ✅ | ✅ | ✅ | ✅ |
| PWM output | ✅ 16-bit | ✅ 16-bit | ✅ 13-bit LEDC | ✅ 13-bit LEDC | ✅ 13-bit LEDC |
| ADC analog read | ✅ GP26–29 | ✅ GP26–29 | ✅ ADC1 only | ✅ ADC1 only | ✅ ADC1 only |
| I2C master (2 buses) | ✅ | ✅ | ✅ | ✅ | ✅ 1 bus |
| I2C batch write | ✅ | ✅ | ✅ | ✅ | ✅ |
| OLED display (SSD1306/SH1106) | ✅ | ✅ | ✅ | ✅ | ✅ |
| SPI master | ✅ SPI0/SPI1 | ✅ SPI0/SPI1 | ✅ SPI3 | ✅ SPI2 | ✅ SPI2 |
| UART serial | ✅ 2 ports | ✅ 2 ports | ✅ 3 ports | ✅ 2 ports | ✅ 2 ports |
| On-die temperature sensor | ✅ ADC ch4 | ✅ ADC ch4 | ✅ | ✅ | ✅ |
| Watchdog timer | ✅ non-disablable | ✅ non-disablable | ✅ | ✅ | ✅ |
| Addressable LEDs (WS2812) | ✅ PIO | ✅ PIO | ❌ | ✅ RMT | ✅ SPI backend |
| Device reboot | ✅ | ✅ | ✅ | ✅ | ✅ |
| Onboard LED | GP25 mono | GP25 mono | GPIO 2 mono | GPIO 8 WS2812 | GPIO 5 WS2812 |

"Simulated" features in the local simulator return mock responses without real hardware.

## Requirements

- A supported board (any of the five above).
- Stable 2.4GHz WiFi network that allows outbound WebSocket connections.
- USB cable with data lines (not power-only).
- For ESP32 family: Python 3 with `esptool` (`pip install esptool`).

**Recommended for serious projects:** 256KB+ RAM, 2MB+ flash, 2.4GHz WiFi.

## Recommended accessories

- Breadboard and jumper wires for prototyping.
- Sensors (temperature, humidity, motion).
- LEDs, buttons, and current-limiting / pull-up resistors.

## Flashing frequency

Flashing installs the DeviceSDK firmware and credentials onto a device. After
initial flashing, device-script updates are deployed from the server; firmware
OTA updates are not yet implemented and require a re-flash for now. See the
[Roadmap](/roadmap/) for upcoming OTA support.

See the [flash command reference](/docs/cli/flash/) for end-to-end flashing instructions.

## Troubleshooting

### Device won't flash

**Pico:** Check the USB cable supports data (not power-only), hold BOOTSEL while plugging in, try a different USB port.

**ESP32 family:** Install esptool (`pip install esptool`); on Linux add your user to the `dialout` group (`sudo usermod -a -G dialout $USER`, then log out/in). If you see "No serial data received", your board may not auto-reset - use manual boot mode and `--before no_reset` (see [flash docs](/docs/cli/flash/)). Try the USB-JTAG port (`/dev/ttyACM0`) instead of the UART port (`/dev/ttyUSB0`), or lower the baud rate with `--baud 115200`.

### Device won't connect

- Verify WiFi credentials.
- Check the network allows outbound WebSocket traffic.
- Confirm the firmware finished flashing before the device was unplugged.

### GPIO not working

- Confirm the pin number is correct for your specific board - onboard LED pins differ across boards.
- Verify the pin is not reserved (e.g., WiFi module pins on Pico W).
- Rule out hardware shorts.

## Community-tested hardware

Users have reported success with RP2040-based clones and Pico-compatible dev boards. These are not officially supported but often work. ESP32-S3 and other ESP32 variants are on the radar but not yet in the firmware.

## Where to buy

- [Raspberry Pi](https://www.raspberrypi.com/products/) - Pico W, Pico 2W.
- [Espressif](https://www.espressif.com/en/products/devkits) - ESP32, ESP32-C3, ESP32-C61 dev boards.
- [Adafruit](https://www.adafruit.com/), [SparkFun](https://www.sparkfun.com/), [Pimoroni](https://shop.pimoroni.com/) - resellers with starter kits.

Typical prices: Pico W around $6–10 USD, ESP32-family dev boards $5–15 USD, full starter kits with sensors $20–40 USD.

## Next steps

- [Your First Device](/docs/first-device/) - build an entrypoint.
- [Quickstart](/docs/quickstart/) - flash and deploy in under 15 minutes.
- [CLI Flash Command](/docs/cli/flash/) - detailed flashing reference.
