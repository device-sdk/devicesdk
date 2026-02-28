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
import { DeviceEntrypoint, DeviceMessage } from '@devicesdk/core';

export default class MyDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    // Called when a device connects
    console.log(`Device connected`);
  }

  async onMessage(message: DeviceMessage) {
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
async onMessage(message: DeviceMessage) {
  switch (message.type) {
    case 'sensor_reading':
      // Store sensor data
      console.info(`Temperature: ${message.temperature}°C`);
      break;
      
    case 'button_press':
      // Respond to button press
      await this.env.DEVICE.send({
        type: 'led',
        state: 'on'
      });
      break;
  }
}
```

## Sending Messages to Devices

Send commands to your devices using the `send` method:

```typescript
// Turn on an LED
await this.env.DEVICE.send({
  type: 'gpio_write',
  pin: 25,
  value: 1
});

// Read an analog sensor
await this.env.DEVICE.send({
  type: 'adc_read',
  pin: 26
});
```

## Complete Example: LED Controller

Here's a complete example that controls an LED based on button presses:

```typescript
import { DeviceEntrypoint, DeviceMessage } from '@devicesdk/core';

export default class LEDController extends DeviceEntrypoint {
  async onDeviceConnect() {
    // Configure button input on GPIO 20
    await this.env.DEVICE.send({
      type: 'gpio_input',
      pin: 20,
      pullup: true
    });

    // Configure LED output on GPIO 25
    await this.env.DEVICE.send({
      type: 'gpio_output',
      pin: 25
    });

    console.info(`Device initialized`);
  }

  async onMessage(message: DeviceMessage) {
    if (message.type === 'gpio_change' && message.pin === 20) {
      // Button pressed (pulled low)
      if (message.value === 0) {
        // Toggle LED state
        this.ledState = !this.ledState;
        
        await this.env.DEVICE.send({
          type: 'gpio_write',
          pin: 25,
          value: this.ledState ? 1 : 0
        });

        console.info(`LED ${this.ledState ? 'ON' : 'OFF'}`);
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

## Need Help?

- [Join our Discord](https://discord.gg/WuNhbXGsBy) for community support
- [View examples](/examples/) for more code samples
- [Troubleshooting guide](/docs/resources/troubleshooting/) for common issues
