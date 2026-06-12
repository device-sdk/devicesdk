---
title: Home Assistant Integration
description: >-
  Expose DeviceSDK devices as native entities in Home Assistant — sensors,
  switches, and lights that work with automations, dashboards, and voice
  assistants.
social_image: /og-images/docs/guides/home-assistant.png
---

## Overview

The DeviceSDK Home Assistant integration exposes your devices as native Home Assistant entities. A GPIO input becomes a `binary_sensor`, an ADC reading becomes a `sensor`, a GPIO output becomes a `switch`, a WS2812 strip becomes a `light`. Home Assistant automations, dashboards, and voice assistants can then read and control them without any extra glue code.

Under the hood the integration points at your self-hosted DeviceSDK server, subscribes to its real-time watch WebSocket for each device, and sends commands through the standard REST API. Both Home Assistant and DeviceSDK run on your own hardware, talking over your LAN.

> **Roadmap item.** This integration is the flagship item on the [DeviceSDK roadmap](https://github.com/devicesdk/devicesdk/blob/main/ROADMAP.md). The server side is already in place — the server persists Home Assistant entity declarations per device and streams `state` frames over the watch WebSocket. The Home Assistant component itself (HACS custom integration, later an official add-on) is in progress.

## Installation

The integration is distributed via [HACS](https://hacs.xyz) (Home Assistant Community Store). Open HACS in your Home Assistant instance, add the DeviceSDK custom repository, and install the integration. Then add it from **Settings → Devices & Services → Add Integration** and enter your DeviceSDK server URL (e.g. `http://<server>:8080`) plus an API token.

Create an API token from the dashboard at `http://<server>:8080`: **Account → API Tokens → Create token**. Tokens are shown exactly once — copy it immediately.

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
| GPIO digital output | `switch` | — | Requires `pin`. |
| PWM output | `light` | — | `light_type: "pwm"`, set `pin` + `pwm_frequency`. |
| WS2812 LED strip | `light` (RGB) | — | `light_type: "ws2812"`, set `num_leds`. |
| Custom telemetry | `sensor` | `user` | Fed by `this.env.DEVICE.emitState(entity_id, value)`. |

See the [Emit State](/docs/concepts/emit-state/) concept for custom telemetry.

## Automations, scripts, dashboards

Once entities appear in Home Assistant they behave like any other entity. Use them in automations (`binary_sensor.front_door` triggers), scripts (`light.living_room_leds` color calls), dashboards (history graphs for temperature sensors), and voice integrations (Alexa, Google Assistant via Home Assistant Cloud).

## Troubleshooting

**Entity missing after deploy** — Reload the DeviceSDK integration in **Settings → Devices & Services**. Home Assistant caches the entity list between refreshes.

**Device shows "unavailable"** — The device has disconnected. Check the dashboard logs page for the last connection status. The integration watches the connection state and marks entities unavailable when the device is offline, matching standard Home Assistant behavior.

**Command timeout on a switch or light** — Confirm the device is connected; commands fail fast when the firmware is offline so Home Assistant automations don't hang. Also check that Home Assistant can reach your DeviceSDK server URL on the LAN.

**Custom sensor value not updating** — Verify your device script calls `this.env.DEVICE.emitState(entity_id, value)` with the exact `entity_id` from your `devicesdk.ts` declaration. Entity IDs are case-sensitive and must match.
