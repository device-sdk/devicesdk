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

## Coming Soon

### ESP32 Series (future)

🔄 **Planned**

- ESP32-C3
- ESP32-S3
- ESP32

## Hardware Requirements

### Minimum Requirements

For DeviceSDK device support:
- Raspberry Pi Pico W or Pico 2W
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

### ADC Pins

ADC-capable pins on Pico W:
- **GP26** - ADC0
- **GP27** - ADC1
- **GP28** - ADC2

### Special Pins

- **GP25** - Onboard LED (Pico W uses different pin for LED)
- **GP23-GP24** - WiFi module (reserved)

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

1. **Raspberry Pi Pico W** - The microcontroller
2. **USB Cable** - Micro-USB data cable (not power-only)
3. **Breadboard** (optional) - For prototyping
4. **Jumper wires** (optional) - For connections

### Recommended Accessories

- **Sensors** - Temperature, humidity, motion, etc.
- **LEDs** - For visual feedback
- **Buttons** - For user input
- **Resistors** - For LED current limiting, pull-ups, etc.

## Testing Your Hardware

### Onboard LED Test

Flash this code to verify hardware:

```typescript
export default class TestDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    // Blink LED 5 times
    for (let i = 0; i < 5; i++) {
      await this.env.DEVICE.send({
        type: 'gpio_write',
        pin: 25,
        value: 1
      });
      await this.sleep(500);
      await this.env.DEVICE.send({
        type: 'gpio_write',
        pin: 25,
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

- [Raspberry Pi](https://www.raspberrypi.com/products/)
- [Adafruit](https://www.adafruit.com/)
- [SparkFun](https://www.sparkfun.com/)
- [Pimoroni](https://shop.pimoroni.com/)

### Price Range

- Raspberry Pi Pico W: $6-10 USD
- Starter kits with accessories: $20-40 USD

## Community-Tested Hardware

Users have reported success with:
- Custom RP2040 boards
- Pico-compatible clones
- Development boards with RP2040

Note: These are not officially supported but may work.

## Troubleshooting

### Device Won't Flash

- Check USB cable supports data (not power-only)
- Ensure BOOTSEL mode is active
- Try different USB port

### Device Won't Connect

- Verify WiFi credentials
- Check network allows WebSocket connections
- Ensure firmware is properly flashed

### GPIO Not Working

- Check pin number is correct
- Verify pin isn't reserved (e.g., WiFi pins)
- Check for hardware shorts

## Future Platform Support

- ESP32 series (highest priority)

## Next Steps

- [Your First Device](/docs/first-device/) - Get started building
- [Quickstart](/docs/quickstart/) - Flash your first device
- [CLI Flash Command](/docs/cli/flash/) - Flashing details
