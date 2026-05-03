---
title: ESP32-C3
description: Single-core RISC-V with 2.4GHz WiFi and WS2812 via RMT
social_image: /og-images/docs/hardware/esp32-c3.png
---

The ESP32-C3 is Espressif's budget single-core RISC-V chip — cheap, low-power, and still feature-complete for DeviceSDK. Unlike the classic [ESP32](/docs/hardware/esp32/), the C3 has the RMT peripheral, which DeviceSDK uses to drive WS2812 addressable LED strips directly.

## Specs

- **Chip**: ESP32-C3 (single-core RISC-V @ 160 MHz)
- **RAM**: 400 KB SRAM
- **Flash**: 4 MB typical
- **WiFi**: 2.4 GHz 802.11 b/g/n
- **Bluetooth**: BLE 5.0 (radio shared with WiFi; BLE not yet exposed in the SDK)
- **GPIO**: 22 pins
- **ADC**: 6 channels, 12-bit
- **PWM**: 6 channels via LEDC, 13-bit
- **I2C**: 1 controller (exposed as bus 0)
- **SPI**: 3 controllers (one reserved for flash; SPI2 usable as master)
- **UART**: 2 ports

## Pin mapping

Standard GPIO pin numbers. The ESP32-C3-DevKitM-1 reference board has its onboard WS2812 LED on **GPIO 8**.

```typescript
// ESP32-C3-DevKitM-1 onboard WS2812 LED — use the addressable-LED API, not setGpioState
await this.env.DEVICE.pioWs2812Configure(8, 1);
await this.env.DEVICE.pioWs2812Update([[0, 64, 0]]); // dim green
```

Pin availability varies slightly by module — the DevKitM-1 exposes GPIO 0–10 and GPIO 18–21. Check your board's pinout diagram before wiring up peripherals.

### 0.42″ OLED variant

A common C3 board style (sold as "ESP32-C3 0.42 OLED", ESP32-C3-FN4 module) carries a built-in 72×40 SSD1306 OLED on the onboard I2C bus:

- **Address**: `0x3C`
- **SDA**: GPIO 5, **SCL**: GPIO 6 *(verify against your board's silkscreen — some variants swap these)*
- **Controller RAM is 128-wide**; the glass sits at **column offset 28** on most FN4 boards. Pass `columnOffset: 28` when constructing the display driver — otherwise your pixels render into the non-visible RAM region or you'll see a 2–4 px noise stripe along the leftmost edge from stale RAM.

If you see a thin vertical noise stripe on the left after the screen is otherwise rendering correctly, your panel's window starts a couple of columns to the left of where you told the SDK. Try `columnOffset: 28` (most common), then `30`, then `32` — pick the value that keeps the stripe out of view *and* keeps your content centered. You can sanity-check by drawing a known mark at framebuffer x=0 (e.g. `display.drawVLine(0, 0, height)`) and confirming it lands exactly on the leftmost lit pixel of the glass.

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';
import { SSD1306 } from '@devicesdk/core/i2c';

export class MyC3OledDevice extends DeviceEntrypoint {
  // Preset bakes in width 72, height 40, columnOffset 28 for the 0.42" glass.
  private display = SSD1306.esp32c3OledVariant();

  async onDeviceConnect() {
    await this.env.DEVICE.sendCommand({
      type: 'i2c_configure',
      payload: { bus: 0, sda_pin: 5, scl_pin: 6, frequency: 400000 }
    });
    this.display.clear().drawText(0, 0, "Hello, C3!");
    await this.env.DEVICE.sendCommand(this.display.toDisplayCommand({ init: true }));
  }
}
```

## Feature support

- ✅ GPIO digital I/O
- ✅ GPIO input monitoring (pull up/down/none)
- ✅ PWM (LEDC, 13-bit, 6 channels)
- ✅ ADC — **ADC1 only**, same WiFi constraint as classic ESP32
- ✅ I2C master — 1 bus
- ✅ I2C batch write
- ✅ OLED display (SSD1306 / SH1106) via the drawing API in `@devicesdk/core`
- ✅ SPI master (SPI2_HOST)
- ✅ UART serial — 2 ports
- ✅ On-die temperature sensor
- ✅ Watchdog timer
- ✅ Addressable LEDs (WS2812) via the RMT peripheral
- ✅ Device reboot

## Platform-specific notes

- **RMT-backed WS2812.** The firmware branches on `SOC_RMT_SUPPORTED` in `firmware/esp32/main/hal.c` and selects the RMT backend for C3. Timing is hardware-accurate; no CPU bit-banging.
- **Single core.** All tasks share one RISC-V core. Long-running operations in your script can delay WiFi handling — prefer short, awaited calls.
- **ADC2 blocked on WiFi.** Same rule as classic ESP32 — stick to ADC1 channels.
- **Pre-built artifact.** The release target is `esp32c3-client.bin` with bootloader offset `0x0` (same layout as the C61). If `devicesdk flash` reports `Firmware for esp32c3 is not yet published`, the artifact has not been promoted yet — build from source in the meantime.

## Flashing

```bash
pip install esptool
devicesdk flash <device-id>
```

The DevKitM-1 auto-resets via its USB-JTAG bridge — no boot button juggling. If you built custom hardware without the bridge, hold BOOT while plugging in USB.

See the [flash command reference](/docs/cli/flash/#esp32-flashing-process).

## Where to buy

- [Espressif ESP32-C3-DevKitM-1](https://www.espressif.com/en/products/devkits) — reference board with onboard WS2812 on GPIO 8.
- Resellers: [Adafruit](https://www.adafruit.com/), [SparkFun](https://www.sparkfun.com/), [Pimoroni](https://shop.pimoroni.com/).

Typical price: **$5–10 USD** for a DevKitM-1.
