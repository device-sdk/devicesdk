---
title: "Emit State"
description: "Publish structured state values from a device script so the dashboard, Home Assistant, and other watchers see them as entity updates."
---

# Emit State

> Publish structured state values from a device script so the dashboard, Home Assistant, and other watchers see them as entity updates.


## Overview

`this.env.DEVICE.emitState(entityId, value)` publishes a structured state update from a device script. Every subscriber on the device's [watch WebSocket](/docs/guides/real-time-watch/) receives the value as a `state` event. Home Assistant uses these events to update the matching entity in real time.

Use `emitState` for anything you want exposed as an entity that isn't one of the built-in hardware signals (GPIO input, onboard temperature, analog reads, which are broadcast automatically).

## Signature

```typescript
emitState(entityId: string, value: unknown): Promise<void>
```

- `entityId` — matches the `entity_id` declared in your `devicesdk.ts` under `ha.entities`. Must be lowercase letters, digits, and underscores.
- `value` — any JSON-serializable value. Numbers become sensor readings, strings become text states, booleans become binary sensor states.

## Example: Soil moisture sensor

```typescript
// devicesdk.ts
export default defineConfig({
  projectId: 'garden',
  devices: {
    'planter-1': {
      entrypoint: 'Planter',
      main: './src/devices/planter.ts',
      deviceType: 'pico-w',
      wifi: { ssid: 'HomeNet', password: 'secret' },
      ha: {
        entities: [
          {
            entity_id: 'soil_moisture',
            type: 'sensor',
            name: 'Planter Moisture',
            unit: '%',
            source: 'user',
          },
        ],
      },
    },
  },
});
```

```typescript
// src/devices/planter.ts
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';
import type { Env } from '../../devicesdk-env';

export class Planter extends DeviceEntrypoint<Env> {
  crons = { poll: '* * * * *' };

  async onCron() {
    // Read the moisture sensor on ADC pin 26
    const reading = await this.env.DEVICE.getPinState(26, 'analog');
    const raw = (reading.payload as { value: number }).value;
    const percent = Math.round((raw / 4095) * 100);

    // Publish to Home Assistant — appears on the "Planter Moisture" sensor
    await this.env.DEVICE.emitState('soil_moisture', percent);
  }

  async onDeviceConnect() {}
  async onDeviceDisconnect() {}
  async onMessage(_message: DeviceResponse) {}
}
```

After `devicesdk deploy`, the `sensor.planter_moisture` entity in Home Assistant updates every minute with the new reading.

## When to use `emitState` vs. a hardware source

DeviceSDK already broadcasts structured state events for GPIO digital changes, analog reads, and the onboard temperature sensor. If your entity is backed by one of those, declare the matching `source` in `devicesdk.ts` and you do not need `emitState` at all.

Use `emitState` when:

- Reading an I2C / SPI / UART sensor (soil moisture, CO₂, IMU, power meters)
- Computing a derived value (rolling average, state machine result)
- Exposing KV state (last-known device setting, last reboot reason)
- Anything else that isn't one of the built-in hardware sources

## Cost

`emitState` is cheap. Every call is a single function invocation inside the device's worker — no extra round-trips to storage or to the device hardware. The state event is only broadcast to active watchers; if no one is subscribed, the call is effectively free.

