# DeviceSDK Core Documentation

## Guides

| Guide | Description |
|-------|-------------|
| [I2C](./i2c.md) | Configuring I2C buses, reading/writing devices, building drivers |
| [Displays](./displays.md) | Using OLED displays (SSD1306/SH1106) with drawing examples |

## Examples

| Example | Description |
|---------|-------------|
| [button-led-toggle.ts](./examples/button-led-toggle.ts) | Simple button to toggle LED with state persistence |
| [oled-button-counter.ts](./examples/oled-button-counter.ts) | OLED display showing LED state and press counter |

## Firmware Implementation

| Document | Description |
|----------|-------------|
| [Device I2C Spec](./device-i2c.md) | Firmware implementation guide for I2C commands |

## Quick Reference

### Command Types

```typescript
import type {
  // I2C
  I2cConfigureCommand,
  I2cScanCommand,
  I2cWriteCommand,
  I2cReadCommand,
  I2cBatchWriteCommand,
  DisplayUpdateCommand,

  // GPIO
  SetGpioStateCommand,
  SetPwmStateCommand,
  ConfigureGpioInputMonitoringCommand,

  // Other
  RebootCommand,
} from '@devicesdk/core';
```

### I2C Helpers

```typescript
import {
  I2cDevice,      // Base class for custom I2C devices
  SSD1306,        // OLED display driver
  font5x7,        // Built-in 5x7 font
  getCharData,    // Get font data for a character
} from '@devicesdk/core/i2c';
```

### Device-Specific Helpers (Type-Safe)

```typescript
import { Pico } from '@devicesdk/core/devices/pico';

// Full autocomplete for valid I2C pin combinations
const cmd = Pico.i2c({ bus: 0, sda_pin: 0, scl_pin: 1 });
```

### Device Entrypoint

```typescript
import { DeviceEntrypoint, DeviceResponse } from '@devicesdk/core';

export class MyDevice extends DeviceEntrypoint {
  onDeviceConnect() {
    // Device connected to cloud
  }

  onDeviceDisconnect() {
    // Device disconnected
  }

  onMessage(message: DeviceResponse) {
    // Handle message from device
  }
}
```
