---
title: "Addressable LEDs"
description: "Drive WS2812 and NeoPixel LED strips from your Pico device"
---

# Addressable LEDs

> Drive WS2812 and NeoPixel LED strips from your Pico device


## What Are Addressable LEDs?

Addressable LEDs (WS2812, NeoPixel, SK6812) are RGB LEDs that can be individually controlled over a single data wire. Each LED contains a tiny controller chip that receives color data and passes the remaining data downstream. This lets you control hundreds of LEDs with just one GPIO pin.

Unlike regular LEDs that are either on or off, each addressable LED accepts a full RGB color value (0-255 per channel), giving you 16 million possible colors per pixel.

## Platform Support

| Platform | Support | Implementation |
|----------|---------|---------------|
| Pico W / Pico 2W | Yes | PIO (Programmable I/O) state machine |
| ESP32 | No | Not currently supported |
| Simulator | Simulated | Returns mock acknowledgments |

Addressable LEDs require precise timing (800 kHz signal with specific pulse widths). The Pico's PIO hardware handles this natively without CPU involvement, making it the ideal platform for LED strip control. ESP32 support is not currently available.

## Wiring

WS2812 LED strips have three connections:

| Wire | Connect To | Notes |
|------|-----------|-------|
| **VCC / 5V** (red) | 5V power supply | Do not power more than ~8 LEDs from the Pico's VBUS pin |
| **GND** (white/black) | Pico GND | Shared ground between Pico and power supply |
| **DIN / Data** (green) | Any Pico GPIO | e.g., GP2 |

### Power Considerations

Each WS2812 LED draws up to 60mA at full white brightness. For strips with many LEDs:

- **1-8 LEDs**: Can be powered from the Pico's VBUS (USB 5V) pin
- **9+ LEDs**: Use an external 5V power supply. Connect the power supply GND to the Pico GND
- **Large strips**: Add a 300-500 ohm resistor on the data line and a 1000uF capacitor across VCC/GND near the strip

### Wiring Diagram

```
Pico GP2 ──[330R]──> DIN (LED strip)

5V Power ──────────> VCC (LED strip)
                 |
              [1000uF]
                 |
GND ────────────┴──> GND (LED strip)
       |
   Pico GND
```

## TypeScript API

### Configure the LED Strip

Tell the firmware which pin and how many LEDs to use:

```typescript
// Configure 16 WS2812 LEDs on pin GP2
await this.env.DEVICE.pioWs2812Configure(2, 16);
```

This initializes the PIO state machine for WS2812 protocol timing on the specified pin. Call this once during `onDeviceConnect()`.

### Update LED Colors

Set the color of every LED by passing an array of `[red, green, blue]` tuples. Each value is 0-255:

```typescript
// Set all 16 LEDs to red
const red: [number, number, number][] = Array.from({ length: 16 }, () => [255, 0, 0]);
await this.env.DEVICE.pioWs2812Update(red);

// Set individual LED colors
const pixels: [number, number, number][] = [
  [255, 0, 0],     // LED 0: red
  [0, 255, 0],     // LED 1: green
  [0, 0, 255],     // LED 2: blue
  [255, 255, 0],   // LED 3: yellow
  [0, 0, 0],       // LED 4: off
  [255, 255, 255], // LED 5: white
  // ... remaining LEDs
];
await this.env.DEVICE.pioWs2812Update(pixels);
```

The array length must match the `numLeds` value from `pioWs2812Configure()`.

## Example: Rainbow Animation

This example creates a smooth rainbow cycle across a strip of LEDs:

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';

const LED_PIN = 2;
const NUM_LEDS = 16;

export default class RainbowDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    await this.env.DEVICE.pioWs2812Configure(LED_PIN, NUM_LEDS);

    // Run 100 frames of rainbow animation
    for (let frame = 0; frame < 100; frame++) {
      const pixels: [number, number, number][] = [];

      for (let i = 0; i < NUM_LEDS; i++) {
        // Each LED is offset in hue, and the whole pattern shifts each frame
        const hue = ((i * 360) / NUM_LEDS + frame * 5) % 360;
        pixels.push(hsvToRgb(hue, 1.0, 0.3)); // 30% brightness to save power
      }

      await this.env.DEVICE.pioWs2812Update(pixels);
      await new Promise(r => setTimeout(r, 50));
    }

    // Turn off all LEDs when done
    const off: [number, number, number][] = Array.from({ length: NUM_LEDS }, () => [0, 0, 0]);
    await this.env.DEVICE.pioWs2812Update(off);
  }
}

/** Convert HSV (hue 0-360, saturation 0-1, value 0-1) to RGB [0-255, 0-255, 0-255]. */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;

  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}
```

## Example: Status Indicator

Use a small LED strip as a status indicator that changes color based on sensor readings:

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';

const LED_PIN = 2;
const NUM_LEDS = 8;
const TEMP_SENSOR_PIN = 26; // ADC pin for temperature sensor

export default class StatusLedDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    await this.env.DEVICE.pioWs2812Configure(LED_PIN, NUM_LEDS);

    // Read temperature and update LED color every 2 seconds
    for (let i = 0; i < 30; i++) {
      const result = await this.env.DEVICE.getTemperature();
      if (result.type === 'temperature_result') {
        const temp = result.payload.celsius;
        const color = temperatureToColor(temp);
        const pixels: [number, number, number][] = Array.from(
          { length: NUM_LEDS },
          () => color
        );
        await this.env.DEVICE.pioWs2812Update(pixels);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

/** Map temperature to a color: blue (cold) -> green (normal) -> red (hot). */
function temperatureToColor(celsius: number): [number, number, number] {
  if (celsius < 20) return [0, 0, 255];      // blue: cold
  if (celsius < 25) return [0, 255, 0];       // green: comfortable
  if (celsius < 30) return [255, 255, 0];     // yellow: warm
  if (celsius < 35) return [255, 128, 0];     // orange: hot
  return [255, 0, 0];                          // red: very hot
}
```

## CLI Inspect Commands

Use `devicesdk inspect <device-id>` to test WS2812 LEDs interactively:

```
ws2812 configure <pin> <num_leds>
ws2812 fill <r> <g> <b> <num_leds>
```

Examples:

```
> ws2812 configure 2 16
OK
> ws2812 fill 255 0 0 16
OK
> ws2812 fill 0 0 0 16
OK
```

The `ws2812 fill` command sets all LEDs to the same color. The `num_leds` argument must match the configured count.

## Tips

- Call `pioWs2812Configure()` once on connect, then call `pioWs2812Update()` as often as needed.
- Keep brightness low (30-50%) for battery-powered projects. Full white at 255,255,255 draws significant current.
- The pixel array must have exactly as many entries as the `numLeds` value in the configure call.
- Color order is RGB: `[red, green, blue]` with each component from 0 to 255.
- Add a short delay (20-50ms) between rapid updates to allow the data to propagate through the strip.
- For long LED strips (50+ LEDs), ensure adequate power supply capacity (3A or more at 5V).

## Next Steps

- [Hardware Compatibility](/docs/hardware/) -- full feature availability table
- [Using SPI](/docs/guides/using-spi/) -- communicate with SPI displays and sensors
- [Using UART](/docs/guides/using-uart/) -- serial communication with GPS and Bluetooth modules

