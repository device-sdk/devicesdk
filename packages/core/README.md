# @devicesdk/core

Core TypeScript types and device abstractions for [DeviceSDK](https://devicesdk.com) IoT applications.

## Installation

```bash
npm install @devicesdk/core
```

## Usage

### Device entrypoints

Extend the `DeviceEntrypoint` class to write device scripts:

```typescript
import { DeviceEntrypoint } from "@devicesdk/core";

export default class MyDevice extends DeviceEntrypoint {
  // Called when the physical device connects via WebSocket
  async onDeviceConnect() {
    await this.ctx.device.log("Device connected!");
  }

  // Called when a response/event is received from the device
  async onMessage(message) {
    await this.ctx.device.log(`Received: ${JSON.stringify(message)}`);
  }

  // Called when the device disconnects
  onDeviceDisconnect() {}

  // Optional: define named cron schedules (UTC)
  crons = { daily: "0 8 * * *" };

  // Called when a named cron fires
  async onCron(name) {
    await this.ctx.device.log(`Cron fired: ${name}`);
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
