# @devicesdk/core

Core TypeScript types and device abstractions for [DeviceSDK](https://devicesdk.com) IoT applications.

## Installation

```bash
npm install @devicesdk/core
```

## Usage

### Device entrypoints

Import the base types for writing device scripts:

```typescript
import { type DeviceEntrypoint, type GetEnv } from "@devicesdk/core";

export default class MyDevice implements DeviceEntrypoint {
  async setup() {
    // Runs once when the device connects
  }

  async loop() {
    // Runs repeatedly after setup
  }
}
```

### I2C peripherals

Import I2C device abstractions for sensors and displays:

```typescript
import { BME280 } from "@devicesdk/core/i2c";
```

### Pico device types

Import Raspberry Pi Pico-specific pin and peripheral types:

```typescript
import { type PicoDeviceApi } from "@devicesdk/core/devices/pico";
```

## License

Copyright (c) 2026 DeviceSDK. All rights reserved. See [LICENSE](./LICENSE) for details.

## Documentation

Full documentation at [devicesdk.com/docs](https://devicesdk.com/docs).
