---
title: Raspberry Pi Pico W
description: RP2040 dual ARM Cortex-M0+ with 2.4GHz WiFi
social_image: /og-images/docs/hardware/pico-w.png
---

The Raspberry Pi Pico W pairs the RP2040 microcontroller with a CYW43439 radio. It's cheap, widely available, and covered end-to-end by DeviceSDK - GPIO, PWM, ADC, I2C, SPI, UART, the on-die temperature sensor, watchdog, and addressable LEDs (WS2812 via PIO) all work.

## Specs

- **Chip**: RP2040 (dual ARM Cortex-M0+ @ 133 MHz)
- **RAM**: 264 KB SRAM
- **Flash**: 2 MB
- **WiFi**: 2.4 GHz 802.11n (CYW43439)
- **GPIO**: 26 pins (GP0–GP28, with some reserved)
- **ADC**: 3 external channels + internal temp sensor (12-bit)
- **PWM**: 16 channels, hardware, 16-bit
- **I2C**: 2 controllers
- **SPI**: 2 controllers (SPI0 / SPI1)
- **UART**: 2 controllers

## Pin mapping

Standard GPIO pin numbers (GP0–GP28) are used directly in `setGpioState` and `getPinState`.

```typescript
// GPIO 25 - onboard LED
await this.env.DEVICE.setGpioState(25, 'high');
```

### ADC-capable pins

- **GP26** - ADC0
- **GP27** - ADC1
- **GP28** - ADC2
- ADC channel 4 - internal on-die temperature sensor

### Reserved / special pins

- **GP23–GP24** - WiFi module (do not use).
- **GP25** - onboard LED (monochrome, driven directly by the CYW43 coprocessor; exposed as virtual pin 99 in some APIs).

## Feature support

- ✅ GPIO digital I/O
- ✅ GPIO input monitoring (pull up/down/none)
- ✅ PWM (16-bit hardware)
- ✅ ADC (GP26–GP28, 12-bit)
- ✅ I2C master - 2 buses, compile-time pin-pair validation (6 valid pairs per bus)
- ✅ I2C batch write
- ✅ OLED display (SSD1306 / SH1106) via the drawing API in `@devicesdk/core`
- ✅ SPI master (SPI0 / SPI1)
- ✅ UART serial (2 ports)
- ✅ On-die temperature sensor (ADC channel 4)
- ✅ Watchdog timer - **cannot be disabled once enabled**; keep feeding it
- ✅ Addressable LEDs (WS2812) via PIO state machine
- ✅ Device reboot (via watchdog)

## Platform-specific notes

- **I2C pin-pair validation.** The core types restrict SDA/SCL pairs to the 6 valid combinations per bus. Invalid pairs fail at compile time - see `packages/core/src/devices/pico.ts`.
- **GPIO monitoring on Core 1.** Input-state polling runs on the second core, so it doesn't compete with the WiFi driver on Core 0.
- **Onboard LED via CYW43.** The LED is on the WiFi coprocessor, not a raw MCU pin. Treat it as on/off only - no PWM.

## Flashing

Pico uses BOOTSEL mode. Hold the BOOTSEL button while plugging in USB; the Pico appears as a USB drive named `RPI-RP2`. Then:

```bash
devicesdk flash <device-id>
```

See the [flash command reference](/docs/cli/flash/#pico-flashing-process) for the full walkthrough.

## Power

- **Input**: 5 V via USB, or 1.8–5.5 V via VSYS.
- **Logic**: 3.3 V.
- **Current**: ~25 mA idle, ~120 mA with WiFi active, ~150 mA peak.

## Where to buy

- [Raspberry Pi - Pico W](https://www.raspberrypi.com/products/raspberry-pi-pico/)
- Resellers: [Adafruit](https://www.adafruit.com/), [SparkFun](https://www.sparkfun.com/), [Pimoroni](https://shop.pimoroni.com/).

Typical price: **$6–10 USD**.
