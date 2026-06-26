---
title: "ESP32"
description: "Classic dual Xtensa LX6 with 2.4GHz WiFi"
---

# ESP32

> Classic dual Xtensa LX6 with 2.4GHz WiFi


The classic ESP32 (WROOM/WROVER modules) is Espressif's workhorse: two Xtensa LX6 cores, plenty of peripherals, and broad board availability. DeviceSDK treats it as a full-featured target — GPIO, PWM, ADC, I2C, SPI, UART, temperature sensor, watchdog, and device reboot all work. Addressable LEDs (WS2812) are the one gap on this specific variant.

## Specs

- **Chip**: ESP32 (dual Xtensa LX6 @ 240 MHz)
- **RAM**: 520 KB SRAM
- **Flash**: 4 MB typical (varies by module)
- **WiFi**: 2.4 GHz 802.11 b/g/n
- **GPIO**: 34 pins (some input-only)
- **ADC**: 18 channels, 12-bit (ADC1 usable; ADC2 blocked when WiFi is active)
- **PWM**: 16 channels via LEDC, 13-bit
- **I2C**: 2 controllers
- **SPI**: 3 controllers (SPI2 / SPI3 — DeviceSDK uses SPI3 by default)
- **UART**: 3 ports (UART0 is reserved for debug)

## Pin mapping

GPIO pin numbers are used directly. The onboard LED is on **GPIO 2** on most classic ESP32 DevKits.

```typescript
// Onboard LED (GPIO 2)
await this.env.DEVICE.setGpioState(2, 'high');
```

Pin assignments vary by board — check the silkscreen or your DevKit's pinout diagram.

## Feature support

- ✅ GPIO digital I/O
- ✅ GPIO input monitoring (pull up/down/none)
- ✅ PWM (LEDC, 13-bit, 16 channels)
- ✅ ADC — **ADC1 only** (ADC2 unavailable whenever WiFi is active)
- ✅ I2C master — 2 buses
- ✅ I2C batch write
- ✅ OLED display (SSD1306 / SH1106) via the drawing API in `@devicesdk/core`
- ✅ SPI master (SPI3_HOST)
- ✅ UART serial — 3 ports, UART0 reserved for debug
- ✅ On-die temperature sensor
- ✅ Watchdog timer
- ❌ Addressable LEDs (WS2812) — **not supported on classic ESP32** in the current firmware. Use [ESP32-C3](/docs/hardware/esp32-c3/) or [ESP32-C61](/docs/hardware/esp32-c61/) if your project needs WS2812.
- ✅ Device reboot

## Platform-specific notes

- **ADC2 is off-limits with WiFi.** The ESP-IDF hardware arbitration means ADC2 reads return errors while WiFi is up. Stick to ADC1 channels.
- **UART0 is the debug port.** Don't reuse it for application serial comms. UART1 and UART2 are free.

## Flashing

Requires `esptool`:

```bash
pip install esptool
devicesdk flash <device-id>
```

On Linux, add your user to the `dialout` group (`sudo usermod -a -G dialout $USER`, then log out/in) for serial port access. If the board doesn't auto-reset, hold BOOT, plug in USB, then release — or pass `--before no_reset` to flash.

See the [flash command reference](/docs/cli/flash/#esp32-flashing-process).

## Where to buy

- [Espressif DevKits](https://www.espressif.com/en/products/devkits) — ESP32-DevKitC is the reference board.
- Resellers: [Adafruit](https://www.adafruit.com/), [SparkFun](https://www.sparkfun.com/), [Pimoroni](https://shop.pimoroni.com/).

Typical price: **$5–15 USD** for a DevKit.

