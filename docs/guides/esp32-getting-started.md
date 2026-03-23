---
title: ESP32 Getting Started
description: "Flash your ESP32 with DeviceSDK firmware and write your first TypeScript script to control hardware. Works with ESP32 and ESP32-C61 boards."
social_image: /og-images/docs/guides/esp32-getting-started.png
---

This guide walks you through getting your ESP32 connected to DeviceSDK and running your first TypeScript device script. No C or C++ required.

## Supported ESP32 Boards

| Board | Status | Notes |
|-------|--------|-------|
| ESP32 (classic, dual Xtensa LX6) | ✅ Full support | Onboard LED on GPIO 2 |
| ESP32-C61 (RISC-V, WiFi 6) | ✅ Full support | Onboard LED is WS2812 on GPIO 8 |
| ESP32-C3, ESP32-S3 | Planned | Not yet supported |

## Prerequisites

- **ESP32 or ESP32-C61 development board**
- **USB-C data cable** (not power-only)
- **Python 3** with esptool: `pip install esptool`
- **Node.js 22+** — [Download Node.js](https://nodejs.org/)
- **DeviceSDK account** — [Sign up free](https://dash.devicesdk.com)

## Step 1: Create a Project

```bash
npx @devicesdk/cli init my-esp32-project
cd my-esp32-project
```

This creates:
- `devicesdk.ts` — project configuration
- `src/devices/` — your device entrypoints

## Step 2: Flash the Firmware

Flash the DeviceSDK firmware to your ESP32. The CLI handles downloading and flashing:

```bash
npx @devicesdk/cli flash device
```

The CLI will:
1. Ask you to select your serial port (e.g., `/dev/ttyUSB0` on Linux, `COM3` on Windows)
2. Download the correct firmware for your board
3. Write credentials (WiFi SSID, password, device token) into the firmware
4. Flash to the device

### Linux: Serial Port Permissions

If you see a permission error on Linux, add yourself to the `dialout` group:

```bash
sudo usermod -a -G dialout $USER
# Log out and back in for the change to take effect
```

### ESP32-C61: Port Selection

The ESP32-C61-DevKitC-1 has two USB ports. Use the **USB-UART** port (usually `/dev/ttyUSB0`, Silicon Labs CP210x) for flashing. If auto-reset doesn't work, try the USB-JTAG port (`/dev/ttyACM0`).

### Manual Boot Mode

If flashing fails with "No serial data received", your board may not support auto-reset. Hold the **BOOT** button, press **EN/RST**, then release BOOT. Re-run the flash command.

## Step 3: Write Your First Script

Open `src/devices/main.ts`. Replace the contents with a blink script for your board:

### ESP32 (classic) — GPIO 2

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';

export default class BlinkDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    console.log('ESP32 connected!');
    const LED_PIN = 2; // Onboard LED on most ESP32 dev boards

    for (let i = 0; i < 10; i++) {
      await this.env.DEVICE.setGpioState(LED_PIN, 'high');
      await new Promise(r => setTimeout(r, 500));
      await this.env.DEVICE.setGpioState(LED_PIN, 'low');
      await new Promise(r => setTimeout(r, 500));
    }

    console.log('Done blinking!');
  }
}
```

### ESP32-C61 — Addressable LED on GPIO 8

The ESP32-C61-DevKitC-1 has a WS2812 RGB LED on GPIO 8, not a plain GPIO LED. Use the addressable LED API:

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';

export default class BlinkDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    console.log('ESP32-C61 connected!');

    // Configure 1 WS2812 LED on GPIO 8
    await this.env.DEVICE.pioWs2812Configure(8, 1);

    // Blink red 5 times
    for (let i = 0; i < 5; i++) {
      await this.env.DEVICE.pioWs2812Update([[255, 0, 0]]); // Red
      await new Promise(r => setTimeout(r, 500));
      await this.env.DEVICE.pioWs2812Update([[0, 0, 0]]);   // Off
      await new Promise(r => setTimeout(r, 500));
    }

    console.log('Done!');
  }
}
```

## Step 4: Deploy and Test

Deploy your script to the cloud:

```bash
npx @devicesdk/cli deploy
```

Stream live logs while your device runs:

```bash
npx @devicesdk/cli logs <project-id> <device-id> --tail
```

You should see your `console.log` messages appear as the device executes the script.

## Pin Reference

### ESP32 (Classic)

| Pin | Function | Notes |
|-----|----------|-------|
| GPIO 0 | Boot mode | Pull low to enter download mode |
| GPIO 2 | Onboard LED | Active high on most boards |
| GPIO 1, 3 | UART0 TX/RX | Reserved for debug serial |
| GPIO 6–11 | SPI flash | Reserved — do not use |
| GPIO 34–39 | Input only | No internal pull-up/down |

ADC1 channels (GPIO 32–39) work normally. ADC2 channels (GPIO 0, 2, 4, 12–15, 25–27) are blocked by the WiFi radio while connected.

### ESP32-C61

| Pin | Function |
|-----|----------|
| GPIO 8 | Onboard WS2812 RGB LED |
| GPIO 5 | Onboard plain LED (some boards) |
| GPIO 12–13 | UART0 (debug) |

## Using Other Peripherals

Once your device is connected, the full hardware API is available:

### Read a Sensor (ADC)

```typescript
const result = await this.env.DEVICE.getPinState(34, 'analog');
if (result.type === 'pin_state_update') {
  const voltage = (result.payload.value / 4095) * 3.3;
  console.log(`Sensor voltage: ${voltage.toFixed(2)}V`);
}
```

### PWM (Servo, LED brightness)

```typescript
// 50Hz PWM at 7.5% duty — typical servo center position
await this.env.DEVICE.setPwmState(18, 50, 0.075);
```

### I2C

```typescript
// Configure I2C on GPIO 21 (SDA) and GPIO 22 (SCL)
await this.env.DEVICE.sendCommand({
  type: 'i2c_configure',
  payload: { bus: 0, sda_pin: 21, scl_pin: 22, frequency: 400000 }
});

// Scan for devices
const scan = await this.env.DEVICE.i2cScan(0);
console.log('Found:', scan.payload.addresses_found);
```

### Monitor a Button

```typescript
async onDeviceConnect() {
  // GPIO 4, pull-up, trigger on state change
  await this.env.DEVICE.configureGpioInputMonitoring(4, true, 'up');
}

onMessage(message) {
  if (message.type === 'gpio_state_changed') {
    console.log(`GPIO ${message.payload.pin}: ${message.payload.state}`);
  }
}
```

## Troubleshooting

### "No serial data received"

- Try manual boot mode: hold BOOT, press EN, release BOOT, then flash
- Try a lower baud rate by re-running `devicesdk flash` and selecting the slower option
- Try the other USB port on the board (USB-JTAG vs USB-UART)

### Device connects but script doesn't run

- Check that you've run `devicesdk deploy` after making changes
- Verify the device token matches between firmware and dashboard
- Check logs: `devicesdk logs <project-id> <device-id> --tail`

### ADC reads always return 0 or noise

- On ESP32, use ADC1 pins (GPIO 32–39). ADC2 is blocked by WiFi.
- Ensure the pin is not in input-only mode (GPIO 34–39 are input-only — OK for ADC)

## Next Steps

- [Hardware Compatibility](/docs/resources/hardware/) — full pin reference and feature matrix
- [Using SPI](/docs/guides/using-spi/) — connect SPI peripherals
- [Using UART](/docs/guides/using-uart/) — serial communication
- [Addressable LEDs](/docs/guides/addressable-leds/) — WS2812 LED strips
- [Control from Browser](/docs/guides/control-from-browser/) — trigger GPIO from a web page
