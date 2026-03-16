---
title: Device Entrypoints
description: Understanding device entrypoint lifecycle and methods
social_image: /og-images/docs/concepts/entrypoints.png
---

## What is an Entrypoint?

An entrypoint is the main handler for device connections. It:
- Receives messages from devices
- Sends commands to devices
- Manages device lifecycle
- Processes events in real-time

## Class Structure

Every entrypoint extends `DeviceEntrypoint`:

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';

export default class MyDevice extends DeviceEntrypoint {
  // Optional: named cron schedules (5-field UTC cron expressions)
  crons = {
    heartbeat: '0-59/5 * * * *',  // every 5 minutes
  };

  // Lifecycle methods
  async onDeviceConnect() { }
  async onMessage(message: DeviceResponse) { }
  async onDeviceDisconnect() { }
  async onCron(name: string) { }
}
```

## Lifecycle Methods

### onDeviceConnect

Called when a device establishes a WebSocket connection.

```typescript
async onDeviceConnect() {
  // Initialize device
  console.info(`Device connected`);
}
```

**Use cases:**
- Initialize device state
- Setup monitoring
- Log connection event

### onMessage

Called when a device sends a message.

```typescript
async onMessage(message: DeviceResponse) {
  // Handle different message types
  switch (message.type) {
    case 'sensor_data':
      await this.handleSensorData(message);
      break;
    case 'alert':
      await this.handleAlert(message);
      break;
  }
}
```

**Use cases:**
- Process sensor readings
- Handle device events
- Store data
- Trigger actions

### onDeviceDisconnect

Called when a device disconnects.

```typescript
async onDeviceDisconnect() {
  // Cleanup
  console.info(`Device disconnected`);

  // Update status
  await this.env.DEVICE.kv.put(`status`, 'offline');
}
```

**Use cases:**
- Update connection status
- Cleanup resources
- Log disconnect event
- Trigger alerts

### onCron

Called when a named schedule defined in `crons` fires. Override this to handle periodic work without needing firmware changes.

```typescript
crons = {
  heartbeat: '*/5 * * * *',   // every 5 minutes
  dailyReport: '0 8 * * *',   // every day at 08:00 UTC
};

async onCron(name: string) {
  if (name === 'heartbeat') {
    const reading = await this.env.DEVICE.i2cRead(0, '0x76', 6);
    console.info('Sensor reading:', reading);

    // Reschedule is automatic — the platform advances the schedule for you
  }

  if (name === 'dailyReport') {
    const summary = await this.env.DEVICE.kv.get('dailySummary');
    // send to webhook, etc.
  }
}
```

**Use cases:**
- Periodic sensor polling (e.g. every 5 minutes)
- Watchdog timer (detect silent/stuck devices)
- Scheduled one-shot actions (e.g. turn LED off at midnight)
- Daily or weekly reports

**Notes:**
- Only one alarm can be pending at a time. The platform manages this automatically when using `crons`.
- The cron fires even if the device is offline — `onCron()` runs in the serverless runtime.
- Hardware commands inside `onCron()` throw if the device is disconnected; wrap them in try/catch.
- Crons run in UTC. Use standard 5-field format: `minute hour dom month dow`.

## Environment Bindings

Your entrypoint has access to these bindings:

### this.env.DEVICE

Send commands and manage devices:

```typescript
// Send commands to the device
await this.env.DEVICE.setGpioState(25, "high");
await this.env.DEVICE.reboot();

// Access KV storage
await this.env.DEVICE.kv.put('key', 'value');
const value = await this.env.DEVICE.kv.get('key');
```

### Logging

Use standard `console` methods — all output is automatically captured and viewable in the dashboard:

```typescript
console.info('Device connected');
console.error('Sensor reading failed', error);
console.warn('Temperature threshold exceeded', { temp: 85 });
```

## Message Handling Patterns

### Event Broadcasting

Device sends event, script processes asynchronously:

```typescript
async onMessage(message: DeviceResponse) {
  if (message.type === 'alert') {
    // Don't wait for external calls
    this.sendEmailAlert(message).catch(err =>
      console.error('Email failed', err)
    );
  }
}
```

### State Management

Maintain device state in KV:

```typescript
async onMessage(message: DeviceResponse) {
  // Load current state
  const state = await this.env.DEVICE.kv.get(`state`);
  
  // Update state
  const newState = { ...JSON.parse(state), ...message.data };
  
  // Save state
  await this.env.DEVICE.kv.put(`state`, JSON.stringify(newState));
}
```

## Multiple Device Support

Handle multiple device types in one project:

```typescript
// devicesdk.ts
export default {
  devices: {
    'temperature-sensor': './src/devices/temp-sensor.ts',
    'motion-detector': './src/devices/motion.ts',
    'led-controller': './src/devices/led.ts'
  }
}
```

Each device type has its own entrypoint class.

## Inter-Device Communication

Devices within the same project can call methods on each other using `this.env.DEVICES`. Public methods on any device class are automatically available to other devices as type-safe remote calls.

### Setup

Run `devicesdk build` to generate `devicesdk-env.d.ts`, then pass the `Env` type to your entrypoint:

```typescript
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';
import type { Env } from '../../devicesdk-env';

export class Sensor extends DeviceEntrypoint<Env> {
  async onMessage(message: DeviceResponse) {
    if (message.type === 'gpio_state_changed' && message.payload.pin === 20) {
      // Type-safe call to another device's public method
      const result = await this.env.DEVICES['led-controller'].turnOn();
      console.info('Light turned on:', result);
    }
  }
}
```

### What's Callable

- **Public methods** you define on device classes are callable remotely
- **Private/protected methods** are hidden from remote callers (TypeScript enforces this)
- **Lifecycle methods** (`onDeviceConnect`, `onMessage`, etc.) and internal properties (`env`, `ctx`) are blocked

### Offline Behavior

Your device script always runs in the serverless runtime, even when hardware is offline:
- **KV operations** (`this.env.DEVICE.kv.put(...)`) always succeed — use this for deferred state
- **Hardware commands** (`this.env.DEVICE.setGpioState(...)`) throw if the device is not connected

### Call Depth Limit

To prevent infinite cycles (device A calls B, which calls A), the maximum call depth is 3.

For a full walkthrough, see the [Inter-Device Communication Guide](/docs/guides/inter-device-communication/).

## Error Handling

Handle errors gracefully:

```typescript
async onMessage(message: DeviceResponse) {
  try {
    await this.processMessage(message);
  } catch (error) {
    console.error('Message processing failed', {
      error: error.message
    });
  }
}
```

## Performance Considerations

### Keep Methods Fast

Entrypoint methods should complete quickly:
- Typical execution: < 10ms
- Maximum: 50ms recommended
- CPU time limited

### Minimize State

- Store only necessary data in KV
- Clean up old data

## Best Practices

1. **Validate messages** - Check message structure before processing
2. **Log important events** - Use structured logging
3. **Handle errors** - Don't let exceptions crash the script
4. **Keep state minimal** - Only store what's needed
5. **Be idempotent** - Handle duplicate messages gracefully

## Next Steps

- [Your First Device](/docs/first-device/) - Build a complete example
- [Platform Architecture](/docs/concepts/architecture/) - System overview
