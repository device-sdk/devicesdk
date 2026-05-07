---
title: Your First Device
description: Learn how to build your first device entrypoint with DeviceSDK
social_image: /og-images/docs/first-device.png
---

## What is a Device Entrypoint?

A device entrypoint is a TypeScript class that handles communication between your devices and your cloud code.

## Basic Structure

Every device entrypoint extends the `DeviceEntrypoint` class:

```typescript
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

export default class MyDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    // Called when a device connects
    console.log(`Device connected`);
  }

  async onMessage(message: DeviceResponse) {
    // Called when a device sends a message
    console.log(`Received from`, message);
  }

  async onDeviceDisconnect() {
    // Called when a device disconnects
    console.log(`Device disconnected`);
  }
}
```

## Handling Device Connections

The `onDeviceConnect` method is called whenever a device establishes a WebSocket connection:

```typescript
async onDeviceConnect() {
  // Initialize device state
  await this.env.DEVICE.kv.put('status', 'online');
}
```

## Receiving Messages from Devices

Handle incoming messages in the `onMessage` method:

```typescript
async onMessage(message: DeviceResponse) {
  switch (message.type) {
    case 'pin_state_update':
      // Store sensor data
      console.info(`Pin ${message.payload.pin}: ${message.payload.value}`);
      break;

    case 'gpio_state_changed':
      // Respond to button press
      await this.env.DEVICE.setGpioState(99, "high");
      break;
  }
}
```

## Sending Commands to Devices

Send commands to your devices using the typed methods:

```typescript
// Turn on an LED
await this.env.DEVICE.setGpioState(25, "high");

// Read an analog pin (returns a numeric value)
const analogReading = await this.env.DEVICE.getPinState(26, "analog");
if (analogReading.type === "pin_state_update" && analogReading.payload.mode === "analog") {
  const value = analogReading.payload.value; // number
  console.info(`Pin 26 analog value: ${value}`);
}

// Read a digital pin (returns "high" or "low")
const digitalReading = await this.env.DEVICE.getPinState(20, "digital");
if (digitalReading.type === "pin_state_update" && digitalReading.payload.mode === "digital") {
  const state = digitalReading.payload.value; // "high" | "low"
  console.info(`Pin 20 is ${state}`);
}
```

## Complete Example: LED Controller

Here's a complete example that controls an LED based on button presses:

```typescript
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

export default class LEDController extends DeviceEntrypoint {
  async onDeviceConnect() {
    // Configure button input on GPIO 20
    await this.env.DEVICE.configureGpioInputMonitoring(20, true, "up");

    console.info(`Device initialized`);
  }

  async onMessage(message: DeviceResponse) {
    if (message.type === 'gpio_state_changed' && message.payload.pin === 20) {
      // Button pressed (pulled low)
      if (message.payload.state === 'low') {
        // Toggle LED
        await this.env.DEVICE.setGpioState(25, "high");
        console.info('LED ON');
      } else {
        await this.env.DEVICE.setGpioState(25, "low");
        console.info('LED OFF');
      }
    }
  }

  async onDeviceDisconnect() {
    console.info(`Device disconnected`);
  }
}
```

## Testing in the Simulator

Use the local simulator to test your device code:

```bash
npx @devicesdk/cli dev
```

The simulator provides:
- Virtual GPIO pins you can toggle
- Simulated button presses
- Mock sensor readings
- Real-time message visualization

## Deploying to Real Hardware

Once tested, deploy your code:

```bash
npx @devicesdk/cli deploy
```

Then flash the firmware to your device:

```bash
npx @devicesdk/cli flash
```

## Environment Bindings

Your device entrypoint has access to several environment bindings:

- `console.log` / `console.info` / etc. - Logging (automatically captured and persisted)
- `this.env.DEVICE` - Send messages to device
- `this.env.DEVICE.kv` - Key-value storage for device state

## Next Steps

- [**CLI Reference**](/docs/cli/) - Learn all CLI commands
- [**Platform Architecture**](/docs/concepts/architecture/) - See how it all works
- [**Inter-Device Communication**](/docs/guides/inter-device-communication/) - Call methods between devices

## Need Help?

- [Join our Discord](https://discord.gg/WuNhbXGsBy) for community support
- [View examples](/examples/) for more code samples
- [Troubleshooting guide](/docs/resources/troubleshooting/) for common issues
