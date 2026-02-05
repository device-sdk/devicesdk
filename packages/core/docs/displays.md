# OLED Display Guide

This guide covers how to use OLED displays (SSD1306, SH1106) with DeviceSDK.

## Overview

The `SSD1306` class provides a high-level API for drawing to OLED displays. It maintains a local framebuffer and sends the entire display contents in a single network call, minimizing latency.

## Supported Displays

| Controller | Common Sizes | Notes |
|------------|--------------|-------|
| SSD1306 | 128x64, 128x32 | Most common, horizontal addressing |
| SH1106 | 128x64 | Similar to SSD1306, page addressing |

## Quick Start

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';
import { SSD1306 } from '@devicesdk/core/i2c';

export class MyDevice extends DeviceEntrypoint {
  private display = new SSD1306({
    address: '0x3C',
    width: 128,
    height: 64
  });

  async onDeviceConnect() {
    // Configure I2C bus (required before display commands)
    await this.env.DEVICE.sendCommand({
      type: 'i2c_configure',
      payload: { bus: 0, sda_pin: 0, scl_pin: 1, frequency: 400000 }
    });

    // Draw something
    this.display
      .clear()
      .drawText(0, 0, 'Hello World!');

    // Send to display (init: true for first time)
    await this.env.DEVICE.sendCommand(
      this.display.toDisplayCommand({ init: true })
    );
  }
}
```

## Configuration Options

```typescript
const display = new SSD1306({
  bus: 0,              // I2C bus number (default: 0)
  address: '0x3C',     // I2C address (default: '0x3C')
  width: 128,          // Display width in pixels (default: 128)
  height: 64,          // Display height in pixels (default: 64)
  controller: 'ssd1306' // Controller type: 'ssd1306' | 'sh1106'
});
```

## Drawing Methods

All drawing methods are chainable and operate on the local framebuffer. Nothing is sent to the display until you call `toDisplayCommand()`.

### Clear / Fill

```typescript
display.clear();  // All pixels off
display.fill();   // All pixels on
```

### Pixels

```typescript
display.setPixel(10, 20, true);   // Turn pixel on
display.setPixel(10, 20, false);  // Turn pixel off

const isOn = display.getPixel(10, 20);  // Read pixel state
```

### Lines

```typescript
// Arbitrary line (Bresenham's algorithm)
display.drawLine(0, 0, 127, 63);

// Optimized horizontal/vertical lines
display.drawHLine(0, 32, 128);   // x, y, length
display.drawVLine(64, 0, 64);    // x, y, length
```

### Rectangles

```typescript
// Outline
display.drawRect(10, 10, 50, 30);

// Filled
display.drawRect(10, 10, 50, 30, true);

// With specific color (false = off)
display.drawRect(10, 10, 50, 30, true, false);
```

### Circles

```typescript
// Outline
display.drawCircle(64, 32, 20);

// Filled
display.drawCircle(64, 32, 20, true);
```

### Text

```typescript
// Basic text (uses built-in 5x7 font)
display.drawText(0, 0, 'Hello!');

// Multi-line text
display.drawText(0, 0, 'Line 1\nLine 2\nLine 3');

// Inverted text (pixels off instead of on)
display.drawText(0, 0, 'Inverted', font5x7, false);
```

### Bitmaps

```typescript
// Draw a custom bitmap (1 bit per pixel, row-major, MSB first)
const heart = new Uint8Array([
  0b01100110,
  0b11111111,
  0b11111111,
  0b01111110,
  0b00111100,
  0b00011000
]);
display.drawBitmap(60, 28, heart, 8, 6);
```

### Invert

```typescript
display.invert();  // Flip all pixels
```

## Sending to Display

```typescript
// First time - include init sequence
await this.env.DEVICE.sendCommand(
  display.toDisplayCommand({ init: true })
);

// Subsequent updates - skip init
await this.env.DEVICE.sendCommand(
  display.toDisplayCommand()
);
```

## Complete Examples

### Clock Display

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';
import { SSD1306 } from '@devicesdk/core/i2c';

export class ClockDevice extends DeviceEntrypoint {
  private display = new SSD1306({ address: '0x3C' });
  private initialized = false;

  async onDeviceConnect() {
    await this.env.DEVICE.sendCommand({
      type: 'i2c_configure',
      payload: { bus: 0, sda_pin: 0, scl_pin: 1 }
    });

    await this.updateDisplay();
  }

  async updateDisplay() {
    const now = new Date();
    const time = now.toLocaleTimeString();
    const date = now.toLocaleDateString();

    this.display
      .clear()
      .drawText(20, 20, time)
      .drawText(20, 35, date)
      .drawLine(0, 50, 127, 50);

    await this.env.DEVICE.sendCommand(
      this.display.toDisplayCommand({ init: !this.initialized })
    );
    this.initialized = true;
  }
}
```

### Status Dashboard

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';
import { SSD1306 } from '@devicesdk/core/i2c';

export class DashboardDevice extends DeviceEntrypoint {
  private display = new SSD1306({ address: '0x3C', width: 128, height: 64 });

  async showStatus(data: { temp: number; humidity: number; wifi: boolean }) {
    this.display
      .clear()
      // Header
      .drawText(0, 0, 'SENSOR STATUS')
      .drawLine(0, 10, 127, 10)
      // Temperature
      .drawText(0, 16, `Temp: ${data.temp.toFixed(1)}C`)
      // Humidity
      .drawText(0, 28, `Humidity: ${data.humidity.toFixed(0)}%`)
      // WiFi indicator
      .drawText(0, 40, `WiFi: ${data.wifi ? 'OK' : 'DISCONNECTED'}`)
      // Border
      .drawRect(0, 0, 128, 64);

    await this.env.DEVICE.sendCommand(this.display.toDisplayCommand());
  }
}
```

### Progress Bar

```typescript
drawProgressBar(x: number, y: number, width: number, height: number, percent: number) {
  // Outline
  this.display.drawRect(x, y, width, height);

  // Fill based on percentage
  const fillWidth = Math.floor((width - 2) * (percent / 100));
  if (fillWidth > 0) {
    this.display.drawRect(x + 1, y + 1, fillWidth, height - 2, true);
  }
}

// Usage
this.drawProgressBar(10, 30, 108, 10, 75);
this.display.drawText(50, 45, '75%');
```

### Animated Spinner

```typescript
private spinnerFrame = 0;
private readonly spinnerChars = ['|', '/', '-', '\\'];

async showLoading(message: string) {
  const char = this.spinnerChars[this.spinnerFrame % 4];
  this.spinnerFrame++;

  this.display
    .clear()
    .drawText(56, 25, char)
    .drawText(20, 40, message);

  await this.env.DEVICE.sendCommand(this.display.toDisplayCommand());
}
```

## Raw Buffer Access

For advanced use cases, you can directly access the framebuffer:

```typescript
// Get buffer (Uint8Array, size = width * height / 8)
const buffer = display.getBuffer();

// Set buffer (must match size)
display.setBuffer(someBuffer);
```

## Font Information

The built-in `font5x7` font:
- 5 pixels wide, 7 pixels tall per character
- 1 pixel spacing between characters
- ASCII 32-126 supported (space through tilde)
- Characters per line: ~21 for 128px width

```typescript
import { font5x7, getCharData } from '@devicesdk/core/i2c';

// Get raw font data for a character
const charData = getCharData('A', font5x7);
// Returns Uint8Array of 5 bytes (one per column)
```

## Tips

1. **Initialize once** - Only use `init: true` on first display update
2. **Batch drawing** - Chain multiple draw calls before sending
3. **Use 400kHz** - OLED displays work well at fast I2C speeds
4. **Clear strategically** - Only clear when needed; partial updates are faster visually
5. **Check your address** - Some displays use 0x3D instead of 0x3C
