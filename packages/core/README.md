# @devicesdk/core

Shared TypeScript types and device abstractions for the [DeviceSDK](https://devicesdk.com) IoT platform. This package provides the `DeviceEntrypoint` base class and all command/response types for controlling ESP32 and Raspberry Pi Pico hardware from the cloud.

## Install

```bash
npm install @devicesdk/core
```

## Usage

Extend `DeviceEntrypoint` to create a device script. Your code runs in the cloud and communicates with the device over a persistent WebSocket.

```typescript
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

export default class MyDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    // Set GPIO pin 25 high (Pico W onboard LED)
    await this.env.DEVICE.setGpioState(25, 'high');
  }

  onMessage(message: DeviceResponse) {
    console.log('Received:', message.type, message.payload);
  }
}
```

## Exports

- `@devicesdk/core` — `DeviceEntrypoint`, command types, response types, `DeviceSenderInterface`
- `@devicesdk/core/i2c` — I2C helper utilities
- `@devicesdk/core/devices/pico` — Pico-specific device types

## Documentation

Full documentation at [devicesdk.com/docs](https://devicesdk.com/docs/).

- [Quickstart](https://devicesdk.com/docs/quickstart/) — get started in 15 minutes
- [Device Entrypoints](https://devicesdk.com/docs/concepts/entrypoints/) — lifecycle methods and patterns
- [Hardware Compatibility](https://devicesdk.com/docs/resources/hardware/) — supported peripherals and pin maps
