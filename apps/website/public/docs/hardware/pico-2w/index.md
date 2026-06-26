---
title: "Raspberry Pi Pico 2W"
description: "RP2350 dual Cortex-M33 with 2.4GHz WiFi, Pico W pin-compatible"
---

# Raspberry Pi Pico 2W

> RP2350 dual Cortex-M33 with 2.4GHz WiFi, Pico W pin-compatible


The Pico 2W is a drop-in upgrade to the [Pico W](/docs/hardware/pico-w/): same footprint, same pinout, same flashing flow — just a faster Cortex-M33 chip, more RAM, and more flash. Everything the Pico W supports, the Pico 2W supports.

## Specs

- **Chip**: RP2350 (dual ARM Cortex-M33 @ 150 MHz)
- **RAM**: 520 KB SRAM
- **Flash**: 8 MB
- **WiFi**: 2.4 GHz
- **GPIO / ADC / PWM / I2C / SPI / UART**: same as Pico W — see the [Pico W pin mapping](/docs/hardware/pico-w/#pin-mapping).

## Feature support

Identical to the [Pico W](/docs/hardware/pico-w/#feature-support). The same firmware binary path applies; the DeviceSDK CLI detects RP2350 automatically via the `RP2350` BOOTSEL drive label.

## Platform-specific notes

- **Pin-compatible with Pico W.** Existing scripts written for Pico W run unchanged on Pico 2W.
- **Larger flash budget.** 8 MB of flash gives more headroom for future firmware features.
- **Watchdog** — same constraint as Pico W: cannot be disabled once enabled.

## Flashing

Hold BOOTSEL while plugging in USB; the board appears as a USB drive named `RP2350`. Then:

```bash
devicesdk flash <device-id>
```

See the [flash command reference](/docs/cli/flash/#pico-flashing-process).

## Power

- **Input**: 5 V via USB, or 1.8–5.5 V via VSYS.
- **Logic**: 3.3 V.
- **Current**: comparable to Pico W under WiFi load.

## Where to buy

- [Raspberry Pi — Pico 2W](https://www.raspberrypi.com/products/raspberry-pi-pico-2/)
- Resellers: [Adafruit](https://www.adafruit.com/), [SparkFun](https://www.sparkfun.com/), [Pimoroni](https://shop.pimoroni.com/).

