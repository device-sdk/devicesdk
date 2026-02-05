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
  // Lifecycle methods
  async onDeviceConnect() { }
  async onMessage(message: DeviceMessage) { }
  async onDeviceDisconnect() { }
}
```

## Lifecycle Methods

### onDeviceConnect

Called when a device establishes a WebSocket connection.

```typescript
async onDeviceConnect() {
  // Initialize device
  await this.env.logger.info(`Device connected`);
}
```

**Use cases:**
- Initialize device state
- Setup monitoring
- Log connection event

### onMessage

Called when a device sends a message.

```typescript
async onMessage(message: DeviceMessage) {
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
  await this.env.logger.info(`Device disconnected`);
  
  // Update status
  await this.env.DEVICE.kv.put(`status`, 'offline');
}
```

**Use cases:**
- Update connection status
- Cleanup resources
- Log disconnect event
- Trigger alerts

## Environment Bindings

Your entrypoint has access to these bindings:

### this.env.DEVICE

Send messages and manage devices:

```typescript
// Send message to device
await this.env.DEVICE.send({
  type: 'command',
  action: 'restart'
});

// Access KV storage
await this.env.DEVICE.kv.put('key', 'value');
const value = await this.env.DEVICE.kv.get('key');
```

### this.env.logger

Structured logging:

```typescript
await this.env.logger.info('Device connected', { });
await this.env.logger.error('Sensor reading failed', { error });
await this.env.logger.warn('Temperature threshold exceeded', { temp: 85 });
```

## Message Handling Patterns

### Event Broadcasting

Device sends event, script processes asynchronously:

```typescript
async onMessage(message: DeviceMessage) {
  if (message.type === 'alert') {
    // Don't wait for external calls
    this.sendEmailAlert(message).catch(err => 
      this.env.logger.error('Email failed', { err })
    );
  }
}
```

### State Management

Maintain device state in KV:

```typescript
async onMessage(message: DeviceMessage) {
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

## Error Handling

Handle errors gracefully:

```typescript
async onMessage(message: DeviceMessage) {
  try {
    await this.processMessage(message);
  } catch (error) {
    await this.env.logger.error('Message processing failed', {
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
