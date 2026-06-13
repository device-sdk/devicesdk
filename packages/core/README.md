# @devicesdk/core

Core TypeScript types and device abstractions for [DeviceSDK](https://devicesdk.com) IoT applications.

## Installation

```bash
npm install @devicesdk/core
```

## Usage

### Device entrypoints

Extend the `DeviceEntrypoint` class to write device scripts. Your script runs **in-process on the DeviceSDK server you host** (a Bun runtime) — **not on the microcontroller and not in Node.js**. It receives events from the device over WebSocket and can issue commands back through `this.env.DEVICE`.

```typescript
import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";

export class MyDevice extends DeviceEntrypoint {
  // Called when the physical device connects via WebSocket
  async onDeviceConnect() {
    console.log("Device connected!");
    // Light up the onboard LED (virtual pin 99 on Pico W and ESP32 boards)
    await this.env.DEVICE.setGpioState(99, "high");
  }

  // Called when a response/event is received from the device.
  // `message` is a discriminated union — narrow on `message.type`.
  async onMessage(message: DeviceResponse) {
    if (message.type === "pin_state_update") {
      console.log(`Pin ${message.payload.pin} = ${message.payload.value}`);
    }
  }

  // Called when the device disconnects
  onDeviceDisconnect() {}

  // Optional: define named cron schedules (UTC)
  crons = { daily: "0 8 * * *" };

  // Called when a named cron fires
  async onCron(name: string) {
    console.log(`Cron fired: ${name}`);
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
