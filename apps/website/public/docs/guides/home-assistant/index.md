---
title: "Home Assistant Integration"
description: "Expose DeviceSDK devices as native entities in Home Assistant: sensors, switches, and lights that work with automations, dashboards, and voice assistants."
---

# Home Assistant Integration

> Expose DeviceSDK devices as native entities in Home Assistant: sensors, switches, and lights that work with automations, dashboards, and voice assistants.


## Overview

The DeviceSDK Home Assistant integration exposes your devices as native Home Assistant entities. A GPIO input becomes a `binary_sensor`, an ADC reading becomes a `sensor`, a GPIO output becomes a `switch`, a WS2812 strip becomes a `light`. Home Assistant automations, dashboards, and voice assistants can then read and control them without any extra glue code.

Under the hood the integration subscribes to a real-time watch WebSocket for each device and sends commands through the standard REST API.

## Installation

The integration is distributed via [HACS](https://hacs.xyz) (Home Assistant Community Store). Open HACS in your Home Assistant instance, add the DeviceSDK custom repository, and install the integration. Then add it from **Settings → Devices & Services → Add Integration** and paste an API token.

Create an API token from the dashboard: **Account → API Tokens → Create token**. Tokens are shown exactly once; copy it immediately.

## Declaring entities

Entities are declared in `devicesdk.ts` under each device's `ha.entities` array. The CLI uploads these declarations when you run `devicesdk deploy`.

```typescript
import { defineConfig } from '@devicesdk/core';

export default defineConfig({
  projectId: 'my-home',
  devices: {
    'front-door': {
      entrypoint: 'DoorSensor',
      main: './src/devices/doorSensor.ts',
      deviceType: 'pico-w',
      wifi: { ssid: 'HomeNet', password: 'secret' },
      ha: {
        entities: [
          {
            entity_id: 'door_open',
            type: 'binary_sensor',
            name: 'Front Door',
            device_class: 'door',
            source: 'gpio_state_changed',
            pin: 15,
            state_map: { high: 'off', low: 'on' },
          },
          {
            entity_id: 'temperature',
            type: 'sensor',
            name: 'Front Door Temperature',
            device_class: 'temperature',
            unit: '°C',
            source: 'temperature_result',
          },
        ],
      },
    },
    'living-room-leds': {
      entrypoint: 'LedStrip',
      main: './src/devices/ledStrip.ts',
      deviceType: 'pico-w',
      wifi: { ssid: 'HomeNet', password: 'secret' },
      ha: {
        entities: [
          {
            entity_id: 'living_room_leds',
            type: 'light',
            name: 'Living Room LEDs',
            source: 'user',
            light_type: 'ws2812',
            num_leds: 60,
          },
        ],
      },
    },
  },
});
```

After `devicesdk deploy`, Home Assistant discovers the entities on its next refresh. Reload the integration from **Settings → Devices & Services → DeviceSDK → Reload** to pick up changes immediately.

## Supported entity types

| Hardware capability | HA entity | `source` | Notes |
|---|---|---|---|
| Device connected | `binary_sensor` (connectivity) | automatic | Always created per device. |
| GPIO digital input | `binary_sensor` | `gpio_state_changed` | Requires `pin`; optional `state_map`. |
| ADC / analog read | `sensor` | `pin_state_update` | Requires `pin`; set `unit` for display. |
| Onboard temperature | `sensor` (temperature) | `temperature_result` | Celsius. |
| GPIO digital output | `switch` | n/a | Requires `pin`. |
| PWM output | `light` | n/a | `light_type: "pwm"`, set `pin` + `pwm_frequency`. |
| WS2812 LED strip | `light` (RGB) | n/a | `light_type: "ws2812"`, set `num_leds`. |
| Custom telemetry | `sensor` | `user` | Fed by `this.env.DEVICE.emitState(entity_id, value)`. |

See the [Emit State](/docs/concepts/emit-state/) concept for custom telemetry.

## Automations, scripts, dashboards

Once entities appear in Home Assistant they behave like any other entity. Use them in automations (`binary_sensor.front_door` triggers), scripts (`light.living_room_leds` color calls), dashboards (history graphs for temperature sensors), and voice integrations (Alexa, Google Assistant via Home Assistant Cloud).

## Troubleshooting

**Entity missing after deploy:** Reload the DeviceSDK integration in **Settings → Devices & Services**. Home Assistant caches the entity list between refreshes.

**Device shows "unavailable":** The device has disconnected. Check the dashboard logs page for the last connection status. The integration watches the connection state and marks entities unavailable when the device is offline, matching standard Home Assistant behavior.

**Command timeout on a switch or light:** The server returned 503 or 504. Confirm the device is connected; commands fail fast when the firmware is offline so Home Assistant automations don't hang.

**Custom sensor value not updating:** Verify your device script calls `this.env.DEVICE.emitState(entity_id, value)` with the exact `entity_id` from your `devicesdk.ts` declaration. Entity IDs are case-sensitive and must match.

