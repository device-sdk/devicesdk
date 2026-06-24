---
title: "How do I surface a sensor as a Home Assistant entity?"
description: "Declare HA entities in devicesdk.ts, push values with emitState, consume via the HA integration"
url: http://localhost:1313/docs/recipes/sensor-to-home-assistant/
---

# How do I surface a sensor as a Home Assistant entity?

> Declare HA entities in devicesdk.ts, push values with emitState, consume via the HA integration


DeviceSDK can publish state directly into Home Assistant without an MQTT broker or a custom add-on. Declare the entities in `devicesdk.ts`; emit values with `this.env.DEVICE.emitState`; install the DeviceSDK Home Assistant integration to subscribe.

This recipe wires the Pico's onboard temperature sensor as a `sensor` entity in HA.

## `devicesdk.ts`

```typescript
import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "ha-thermometer",
  devices: {
    thermometer: {
      className: "Thermometer",
      main: "./src/devices/thermometer.ts",
      deviceType: "pico-w",
      wifi: { ssid: "YOUR_WIFI_SSID", password: "YOUR_WIFI_PASSWORD" },
      ha: {
        entities: [
          {
            entity_id: "chip_temperature",
            type: "sensor",
            name: "Chip temperature",
            unit: "°C",
            device_class: "temperature",
            source: "user", // values come from emitState; firmware doesn't know about this entity
          },
        ],
      },
    },
  },
});
```

## `src/devices/thermometer.ts`

```typescript
import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";

export class Thermometer extends DeviceEntrypoint {
  crons = { sample: "*/1 * * * *" };

  async onCron() {
    await this.env.DEVICE.getTemperature();
  }

  async onMessage(message: DeviceResponse) {
    if (message.type !== "temperature_result") return;
    await this.env.DEVICE.emitState("chip_temperature", message.payload.celsius);
  }
}
```

## Wire up Home Assistant

1. Install the [DeviceSDK HA integration](/docs/guides/home-assistant/) (one-time per HA instance).
2. Add an API token from the dashboard's *Tokens* page in the integration's setup form.
3. Your project's devices appear under *Settings → Devices & Services → DeviceSDK*. Each declared entity shows up as a regular HA sensor / binary_sensor / switch / light / number.

## What this demonstrates

- The `ha.entities` array in `devicesdk.ts` declares HA-side metadata (entity_id, type, unit, device_class). DeviceSDK uploads it on `deploy`.
- `emitState(entity_id, value)` pushes the value to anyone watching — the HA integration, the dashboard, anything subscribed to the device's watch WebSocket.
- The `source: "user"` flag tells the runtime that values come from your script (rather than being auto-derived from a firmware event like `gpio_state_changed`). For GPIO-backed entities, you'd use `source: "gpio_state_changed"` and add a `pin` field — no `emitState` call needed.

## Going further

- Add a `binary_sensor` for a wired door reed switch — `source: "gpio_state_changed"`, `pin: 20`, `state_map: { high: "off", low: "on" }`.
- Add a `light` entity for a WS2812 strip — `source: "user"`, `light_type: "ws2812"`, `num_leds: 30`.
- See the [Home Assistant guide](/docs/guides/home-assistant/) for the full entity schema.

