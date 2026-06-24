---
title: "Inter-Device Communication"
description: "Call methods between devices with type-safe RPC"
url: http://localhost:1313/docs/guides/inter-device-communication/
---

# Inter-Device Communication

> Call methods between devices with type-safe RPC


## Overview

Devices in the same project can call public methods on each other using `this.env.DEVICES`. The call routes through the serverless runtime, so both devices don't need to be online simultaneously — methods that only use KV storage work even when hardware is disconnected.

## Walkthrough: Sensor + Light Controller

### Step 1: Define Your Devices

Create two device entrypoints with public methods:

```typescript
// src/devices/light.ts
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';
import type { Env } from '../../devicesdk-env';

export class LightController extends DeviceEntrypoint<Env> {
  async turnOn() {
    await this.env.DEVICE.setGpioState(5, 'high');
    return { status: 'on' as const };
  }

  async turnOff() {
    await this.env.DEVICE.setGpioState(5, 'low');
    return { status: 'off' as const };
  }

  async updateDesiredState(state: { brightness: number }) {
    // KV writes always work, even when hardware is offline
    await this.env.DEVICE.kv.put('desired', state);
  }

  async onDeviceConnect() {
    // Apply saved state when hardware reconnects
    const desired = await this.env.DEVICE.kv.get<{ brightness: number }>('desired');
    if (desired) {
      console.info('Applying saved brightness:', desired.brightness);
    }
  }

  async onMessage(message: DeviceResponse) {
    // Handle hardware messages
  }
}
```

```typescript
// src/devices/sensor.ts
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';
import type { Env } from '../../devicesdk-env';

export class Sensor extends DeviceEntrypoint<Env> {
  async onMessage(message: DeviceResponse) {
    if (message.type === 'gpio_state_changed' && message.payload.pin === 20) {
      // Type-safe! Autocomplete shows: turnOn, turnOff, updateDesiredState
      // Does NOT show: onDeviceConnect, onMessage, env, ctx
      const result = await this.env.DEVICES['light-controller'].turnOn();
      console.info('Light turned:', result.status);
    }
  }

  async onDeviceConnect() {
    await this.env.DEVICE.configureGpioInputMonitoring(20, true, 'up');
    console.info('Sensor ready, monitoring GPIO 20');
  }

  async onDeviceDisconnect() {
    console.info('Sensor disconnected');
  }
}
```

### Step 2: Configure Your Project

```typescript
// devicesdk.ts
import { defineConfig } from '@devicesdk/cli';

export default defineConfig({
  projectId: 'smart-home',
  devices: {
    'light-controller': {
      main: './src/devices/light.ts',
      entrypoint: 'LightController',
      deviceType: 'pico-w',
      wifi: { ssid: '...', password: '...' },
    },
    'sensor': {
      main: './src/devices/sensor.ts',
      entrypoint: 'Sensor',
      deviceType: 'pico-w',
      wifi: { ssid: '...', password: '...' },
    },
  },
});
```

### Step 3: Generate Types

Run `devicesdk build` to generate `devicesdk-env.d.ts`:

```bash
devicesdk build
# Output:
# ✓ Generated devicesdk-env.d.ts
# ✓ Built light-controller.js (2.1 KB)
# ✓ Built sensor.js (1.8 KB)
```

The generated file looks like:

```typescript
// devicesdk-env.d.ts — auto-generated, committed to repo
import type { LightController } from './src/devices/light';
import type { Sensor } from './src/devices/sensor';
import type { GetEnv } from '@devicesdk/core';

export type ProjectDevices = {
  'light-controller': LightController;
  'sensor': Sensor;
};

export type Env = GetEnv<ProjectDevices>;
```

### Step 4: Deploy and Test

```bash
devicesdk deploy
```

When the sensor detects a button press on GPIO 20, it calls `turnOn()` on the light controller and receives the typed response `{ status: 'on' }`.

## Error Handling

Wrap remote calls in try/catch for production code:

```typescript
async onMessage(message: DeviceResponse) {
  if (message.type === 'gpio_state_changed') {
    try {
      await this.env.DEVICES['light-controller'].turnOn();
    } catch (error) {
      console.error('Failed to call light controller:', error);
    }
  }
}
```

Common errors:
- **Device not found** — the target device slug doesn't exist in your project
- **No deployed script** — the target device has no script deployed yet
- **Method not found** — the method doesn't exist on the target device class
- **Call depth exceeded** — too many chained calls (max depth: 3)

## Patterns

### Deferred State

Write state via KV when hardware is offline, apply when it reconnects:

```typescript
// From any device — works even when light hardware is disconnected
await this.env.DEVICES['light-controller'].updateDesiredState({ brightness: 80 });

// In LightController.onDeviceConnect() — applied when hardware comes back
const desired = await this.env.DEVICE.kv.get('desired');
if (desired) { /* apply to hardware */ }
```

### Chained Calls (A → B → C)

Devices can chain calls up to a depth of 3:

```typescript
// Device A calls B
await this.env.DEVICES['device-b'].doSomething();

// Device B's doSomething() calls C
async doSomething() {
  await this.env.DEVICES['device-c'].finalize();
  return { done: true };
}
```

## Limitations

- **Same project only** — devices can only call other devices in the same project
- **Max call depth: 3** — prevents infinite cycles between devices
- **Serializable arguments** — RPC arguments and return values must be JSON-compatible (no functions, symbols, or class instances)
- **No pub/sub yet** — RPC is point-to-point; project-wide event broadcasting is on the roadmap

## Next Steps

- [Device Entrypoints](/docs/concepts/entrypoints/) — Lifecycle methods and environment bindings
- [Platform Architecture](/docs/concepts/architecture/) — How the runtime works

