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

### ESP32-C3

✅ **Full support**

- **Chip**: ESP32-C3 (Single RISC-V @ 160MHz)
- **RAM**: 400KB SRAM
- **Flash**: 4MB (typical)
- **WiFi**: 2.4GHz 802.11 b/g/n
- **Bluetooth**: BLE 5.0 (radio shared with WiFi; BLE not yet exposed in the SDK)
- **GPIO**: 22 pins
- **ADC**: 6 channels, 12-bit
- **I2C**: 1 controller
- **SPI**: 3 controllers (one reserved for flash)
- **UART**: 2 controllers
- **Addressable LEDs**: Onboard WS2812 on GPIO 8 (DevKitM-1). C3 has an RMT peripheral, so `led_strip` uses the RMT backend — unlike C61, which runs the same code path on the SPI backend.

## Hardware Requirements

### Minimum Requirements

For DeviceSDK device support:
- Raspberry Pi Pico W / Pico 2W, or an ESP32 / ESP32-C61 / ESP32-C3 board
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
await this.env.DEVICE.setGpioState(25, 'high');
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
| ESP32-C3 (DevKitM-1) | GPIO 8 (WS2812) |

```typescript
// ESP32 onboard LED (GPIO 2)
await this.env.DEVICE.setGpioState(2, 'high');

// ESP32-C61 onboard LED (GPIO 5)
await this.env.DEVICE.setGpioState(5, 'high');

// ESP32-C3 DevKitM-1 onboard WS2812 (GPIO 8)
await this.env.DEVICE.setGpioState(8, 'high');
```

## Platform Feature Availability

| Feature | ESP32 | Pico | Simulator | Notes |
|---------|:-----:|:----:|:---------:|-------|
| GPIO digital I/O | Yes | Yes | Yes | |
| GPIO input monitoring | Yes | Yes | Yes | Pull up/down/none |
| PWM output | Yes | Yes | Yes | |
| ADC analog read | Yes | Yes | Yes | ESP32: ADC1 only (ADC2 blocked by WiFi) |
| I2C master | Yes | Yes | Yes | 2 buses, configure/scan/read/write |
| I2C batch write | Yes | Yes | Yes | Reduces round-trips for multi-register writes |
| OLED display (SSD1306/SH1106) | Yes | Yes | Yes | Full drawing API in @devicesdk/core |
| SPI master | Yes | Yes | Simulated | ESP32: SPI3; Pico: SPI0/SPI1 |
| UART serial | Yes | Yes | Simulated | ESP32: UART0 reserved for debug |
| On-die temperature sensor | Yes | Yes | Simulated | No external hardware needed |
| Watchdog timer | Yes | Yes | Simulated | Pico: cannot disable once enabled |
| Addressable LEDs (WS2812) | No | Yes | Simulated | Pico only via PIO |
| Device reboot | Yes | Yes | No | |

"Simulated" means the simulator returns mock responses without real hardware.

### GPIO Digital I/O

Set any GPIO pin high or low. Use `setGpioState()` for output and `getPinState()` for reading:

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';

export default class BlinkDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    const LED_PIN = 25; // Pico W — use 2 for ESP32

    for (let i = 0; i < 5; i++) {
      await this.env.DEVICE.setGpioState(LED_PIN, 'high');
      await new Promise(r => setTimeout(r, 500));
      await this.env.DEVICE.setGpioState(LED_PIN, 'low');
      await new Promise(r => setTimeout(r, 500));
    }
  }
}
```

### GPIO Input Monitoring

Monitor a pin for state changes. The device will push `gpio_state_changed` events to your `onMessage` handler:

```typescript
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

export default class ButtonDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    // Monitor pin 15 with internal pull-up resistor
    await this.env.DEVICE.configureGpioInputMonitoring(15, true, 'up');
  }

  onMessage(message: DeviceResponse) {
    if (message.type === 'gpio_state_changed') {
      console.log(`Pin ${message.payload.pin} is now ${message.payload.state}`);
    }
  }
}
```

### PWM Output

Control LED brightness, servo motors, or buzzer tones with pulse-width modulation:

```typescript
// Set pin 16 to 1kHz at 50% duty cycle
await this.env.DEVICE.setPwmState(16, 1000, 0.5);

// Dim an LED to 25% brightness (low frequency for LEDs)
await this.env.DEVICE.setPwmState(25, 1000, 0.25);

// Stop PWM output (0% duty cycle)
await this.env.DEVICE.setPwmState(16, 1000, 0);
```

### ADC Analog Read

Read analog voltage (0-3.3V, 12-bit resolution) from ADC-capable pins:

```typescript
// Read analog value from pin 26 (Pico ADC0)
const result = await this.env.DEVICE.getPinState(26, 'analog');
if (result.type === 'pin_state_update') {
  const voltage = (result.payload.value / 4095) * 3.3;
  console.log(`Voltage: ${voltage.toFixed(2)}V`);
}
```

On ESP32, only ADC1 pins are available for analog reads because ADC2 is used by WiFi.

### I2C

Configure I2C bus pins, scan for devices, and read/write registers. Data values are hex strings (e.g., `"0x3C"`):

```typescript
// Configure I2C bus 0 with SDA on pin 4, SCL on pin 5
await this.env.DEVICE.sendCommand({
  type: 'i2c_configure',
  payload: { bus: 0, sda_pin: 4, scl_pin: 5, frequency: 400000 }
});

// Scan for connected devices
const scanResult = await this.env.DEVICE.i2cScan(0);
if (scanResult.type === 'i2c_scan_result') {
  console.log('Found devices:', scanResult.payload.addresses_found);
}

// Write to a device register
await this.env.DEVICE.i2cWrite(0, '0x3C', ['0x00', '0xAE']);

// Read 2 bytes from register 0xD0
const readResult = await this.env.DEVICE.i2cRead(0, '0x3C', 2, '0xD0');
```

Use batch writes to reduce round-trips when writing multiple registers:

```typescript
// Write multiple register sequences in one command
await this.env.DEVICE.sendCommand({
  type: 'i2c_batch_write',
  payload: {
    bus: 0,
    address: '0x3C',
    writes: [
      ['0x00', '0xAE'],  // Display OFF
      ['0x00', '0xD5'],  // Set display clock
      ['0x00', '0x80'],  // Clock value
    ]
  }
});
```

### SPI

Full-duplex communication with SPI peripherals. See the [Using SPI](/docs/guides/using-spi/) guide for details.

```typescript
// Configure SPI bus
await this.env.DEVICE.spiConfigure(0, 18, 19, 16, 17, 1000000, 0);

// Full-duplex transfer (sends and receives simultaneously)
const result = await this.env.DEVICE.spiTransfer(0, ['0x9F', '0x00', '0x00']);
```

### UART

Serial communication with external modules. See the [Using UART](/docs/guides/using-uart/) guide for details.

```typescript
// Configure UART port 1 at 9600 baud
await this.env.DEVICE.uartConfigure(1, 4, 5, 9600);

// Write data
await this.env.DEVICE.uartWrite(1, ['0x48', '0x65', '0x6C', '0x6C', '0x6F']);

// Read up to 32 bytes with a 1-second timeout
const result = await this.env.DEVICE.uartRead(1, 32, 1000);
```

### On-Die Temperature Sensor

Read the microcontroller's built-in temperature sensor (no external hardware required):

```typescript
const result = await this.env.DEVICE.getTemperature();
if (result.type === 'temperature_result') {
  console.log(`CPU temp: ${result.payload.celsius.toFixed(1)}C`);
}
```

### Watchdog Timer

Reset the device automatically if your code stops responding. Feed the watchdog periodically to prevent resets:

```typescript
// Enable watchdog with 8-second timeout
await this.env.DEVICE.watchdogConfigure(8000, true);

// Feed the watchdog in your main loop
await this.env.DEVICE.watchdogFeed();
```

On Pico, the watchdog cannot be disabled once enabled -- you must continue feeding it or the device will reboot.

### Addressable LEDs (WS2812)

Drive WS2812/NeoPixel LED strips from Pico devices using PIO. See the [Addressable LEDs](/docs/guides/addressable-leds/) guide for details.

```typescript
// Configure 8 LEDs on pin 2
await this.env.DEVICE.pioWs2812Configure(2, 8);

// Set all LEDs to green
const green: [number, number, number][] = Array.from({ length: 8 }, () => [0, 255, 0]);
await this.env.DEVICE.pioWs2812Update(green);
```

### Device Reboot

Programmatically restart the device:

```typescript
await this.env.DEVICE.reboot();
```

The WebSocket connection will drop after reboot. The device will reconnect automatically and trigger `onDeviceConnect` again.

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

**For ESP32 / ESP32-C61 / ESP32-C3:**
1. **ESP32, ESP32-C61, or ESP32-C3 development board**
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
- **ESP32-C3 (DevKitM-1)**: pin `8` (WS2812)

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';

const LED_PIN = 25; // Pico W — use 2 for ESP32, 5 for ESP32-C61, 8 for ESP32-C3

export default class TestDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    // Blink LED 5 times
    for (let i = 0; i < 5; i++) {
      await this.env.DEVICE.setGpioState(LED_PIN, 'high');
      await new Promise(r => setTimeout(r, 500));
      await this.env.DEVICE.setGpioState(LED_PIN, 'low');
      await new Promise(r => setTimeout(r, 500));
    }
  }
}
```

If LED blinks, your hardware is working!

## Where to Buy

### Official Distributors

- [Raspberry Pi](https://www.raspberrypi.com/products/) — Pico W, Pico 2W
- [Espressif](https://www.espressif.com/en/products/devkits) — ESP32, ESP32-C61, ESP32-C3 dev boards
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

- ESP32-S3 (planned)

## Next Steps

- [Your First Device](/docs/first-device/) - Get started building
- [Quickstart](/docs/quickstart/) - Flash your first device
- [CLI Flash Command](/docs/cli/flash/) - Flashing details
