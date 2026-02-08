---
title: Hardware Compatibility
description: Supported microcontrollers and hardware platforms
social_image: /og-images/docs/resources/hardware.png
---

## Officially Supported

### Raspberry Pi Pico W

✅ **Full support**

- **Chip**: RP2040 (Dual ARM Cortex-M0+ @ 133MHz)
- **RAM**: 264KB SRAM
- **Flash**: 2MB
- **WiFi**: 2.4GHz 802.11n (CYW43439)
- **GPIO**: 26 pins
- **ADC**: 3 channels, 12-bit
- **PWM**: 16 channels
- **I2C**: 2 controllers
- **SPI**: 2 controllers
- **UART**: 2 controllers

### Raspberry Pi Pico 2W

✅ **Full support**

- **Chip**: RP2350 (Dual Cortex-M33 @ 150MHz)
- **RAM**: 520KB SRAM
- **Flash**: 8MB
- **WiFi**: 2.4GHz
- **GPIO/ADC/PWM/I2C/SPI/UART**: Compatible footprint and pinout with Pico W

### ESP32

✅ **Full support**

- **Chip**: ESP32 (Dual Xtensa LX6 @ 240MHz)
- **RAM**: 520KB SRAM
- **Flash**: 4MB (typical)
- **WiFi**: 2.4GHz 802.11 b/g/n
- **GPIO**: 34 pins
- **ADC**: 18 channels, 12-bit
- **PWM**: 16 channels (LEDC)
- **I2C**: 2 controllers
- **SPI**: 3 controllers
- **UART**: 3 controllers

### ESP32-C61

✅ **Full support**

- **Chip**: ESP32-C61 (Single RISC-V @ 160MHz)
- **RAM**: 256KB SRAM
- **Flash**: 4MB (typical)
- **WiFi**: 2.4GHz 802.11 b/g/n/ax (WiFi 6)
- **GPIO**: 22 pins
- **ADC**: 7 channels, 12-bit
- **I2C**: 1 controller
- **SPI**: 2 controllers
- **UART**: 2 controllers

## Hardware Requirements

### Minimum Requirements

For DeviceSDK device support:
- Raspberry Pi Pico W / Pico 2W, or an ESP32 / ESP32-C61 board
- Stable WiFi connectivity

### Recommended

- 256KB+ RAM for complex applications
- 2MB+ Flash for future updates
- 2.4GHz WiFi
- Hardware floating point

## Pin Mapping

### Raspberry Pi Pico W

Standard GPIO pin numbers (GP0-GP28) are used directly:

```typescript
// GPIO 25 (onboard LED)
await this.env.DEVICE.send({
  type: 'gpio_write',
  pin: 25,
  value: 1
});
```

### Pico W ADC Pins

ADC-capable pins on Pico W:
- **GP26** - ADC0
- **GP27** - ADC1
- **GP28** - ADC2

### Pico W Special Pins

- **GP25** - Onboard LED (Pico W uses different pin for LED)
- **GP23-GP24** - WiFi module (reserved)

### ESP32

Standard GPIO pin numbers are used directly. The onboard LED pin varies by board:

| Board | Onboard LED Pin |
|-------|----------------|
| ESP32 (classic) | GPIO 2 |
| ESP32-C61 | GPIO 5 |

```typescript
// ESP32 onboard LED (GPIO 2)
await this.env.DEVICE.send({
  type: 'gpio_write',
  pin: 2,
  value: 1
});

// ESP32-C61 onboard LED (GPIO 5)
await this.env.DEVICE.send({
  type: 'gpio_write',
  pin: 5,
  value: 1
});
```

## Peripheral Support

### GPIO
✅ Digital input/output
✅ Pull-up/pull-down resistors
✅ Interrupt-driven monitoring

### ADC
✅ 12-bit analog input
✅ 0-3.3V range
✅ Continuous sampling

### PWM
✅ 16 independent channels
✅ Configurable frequency
✅ Duty cycle control

### I2C
✅ Master mode
✅ Standard (100kHz) and Fast (400kHz)
⚠️ Slave mode not yet supported

### SPI
✅ Master mode
⚠️ Slave mode not yet supported

### UART
✅ Serial communication
✅ Configurable baud rate

## Power Specifications

### Raspberry Pi Pico W

- **Input voltage**: 5V via USB or 1.8-5.5V via VSYS
- **Operating voltage**: 3.3V logic
- **Current draw**: 
  - Idle: ~25mA
  - WiFi active: ~120mA
  - Peak: ~150mA

### Raspberry Pi Pico 2W

- **Input voltage**: 5V via USB or 1.8-5.5V via VSYS
- **Operating voltage**: 3.3V logic
- **Current draw**: similar to Pico W under WiFi load

### Power Considerations

For battery operation:
- Use sleep modes to conserve power
- Disable WiFi when not needed
- Efficient code reduces power usage

## Flashing Frequency

Flashing is typically **one-time per device**. After the first flash, updates are delivered **over-the-air (OTA)**. Only major firmware upgrades might need a repeat flash, and those are optional unless you specifically want the new firmware capabilities.

## Development Setup

### Required Hardware

**For Pico W / Pico 2W:**
1. **Raspberry Pi Pico W or Pico 2W**
2. **USB Cable** — Micro-USB data cable (not power-only)

**For ESP32 / ESP32-C61:**
1. **ESP32 or ESP32-C61 development board**
2. **USB-C cable** — Data-capable USB-C cable
3. **Python 3** — Required for esptool (`pip install esptool`)

**Optional:**
- **Breadboard** — For prototyping
- **Jumper wires** — For connections

### Recommended Accessories

- **Sensors** - Temperature, humidity, motion, etc.
- **LEDs** - For visual feedback
- **Buttons** - For user input
- **Resistors** - For LED current limiting, pull-ups, etc.

## Testing Your Hardware

### Onboard LED Test

Flash this code to verify hardware. Use the correct LED pin for your board:
- **Pico W / Pico 2W**: pin `25`
- **ESP32**: pin `2`
- **ESP32-C61**: pin `5`

```typescript
const LED_PIN = 25; // Pico W — use 2 for ESP32, 5 for ESP32-C61

export default class TestDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    // Blink LED 5 times
    for (let i = 0; i < 5; i++) {
      await this.env.DEVICE.send({
        type: 'gpio_write',
        pin: LED_PIN,
        value: 1
      });
      await this.sleep(500);
      await this.env.DEVICE.send({
        type: 'gpio_write',
        pin: LED_PIN,
        value: 0
      });
      await this.sleep(500);
    }
  }
}
```

If LED blinks, your hardware is working!

## Where to Buy

### Official Distributors

- [Raspberry Pi](https://www.raspberrypi.com/products/) — Pico W, Pico 2W
- [Espressif](https://www.espressif.com/en/products/devkits) — ESP32, ESP32-C61 dev boards
- [Adafruit](https://www.adafruit.com/)
- [SparkFun](https://www.sparkfun.com/)
- [Pimoroni](https://shop.pimoroni.com/)

### Price Range

- Raspberry Pi Pico W: $6-10 USD
- ESP32 dev boards: $5-15 USD
- Starter kits with accessories: $20-40 USD

## Community-Tested Hardware

Users have reported success with:
- Custom RP2040 boards
- Pico-compatible clones
- Development boards with RP2040

Note: These are not officially supported but may work.

## Troubleshooting

### Pico Won't Flash

- Check USB cable supports data (not power-only)
- Ensure BOOTSEL mode is active (hold BOOTSEL while plugging in USB)
- Try a different USB port

### ESP32 Won't Flash

- Install esptool: `pip install esptool`
- Check serial port permissions on Linux: `sudo usermod -a -G dialout $USER` (then log out/in)
- If you see "No serial data received", your board may not support auto-reset — use manual boot mode and `--before no_reset` (see [flash docs](/docs/cli/flash/))
- Try the USB-JTAG port (`/dev/ttyACM0`) instead of the UART port (`/dev/ttyUSB0`)
- Lower the baud rate: `--baud 115200`

### Device Won't Connect

- Verify WiFi credentials
- Check network allows WebSocket connections
- Ensure firmware is properly flashed

### GPIO Not Working

- Check pin number is correct for your board (LED pins differ between boards)
- Verify pin isn't reserved (e.g., WiFi pins on Pico W)
- Check for hardware shorts

## Future Platform Support

- ESP32-C3, ESP32-S3 (planned)

## Next Steps

- [Your First Device](/docs/first-device/) - Get started building
- [Quickstart](/docs/quickstart/) - Flash your first device
- [CLI Flash Command](/docs/cli/flash/) - Flashing details
