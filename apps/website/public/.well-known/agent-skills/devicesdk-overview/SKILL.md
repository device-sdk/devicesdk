---
name: devicesdk-overview
description: DeviceSDK is a managed IoT platform. Users write TypeScript device scripts, deploy them to a globally distributed runtime, and flash firmware onto microcontrollers (Raspberry Pi Pico W, ESP32 family) that connect back over WebSocket. A Home Assistant integration exposes devices as native HA entities.
---

## What it is
- **Cloud side** — a serverless runtime that executes a TypeScript entrypoint class per device connection.
- **Device side** — firmware for Pico and ESP32 with a HAL for GPIO, PWM, ADC, I2C, SPI, UART, and addressable LEDs (WS2812).
- **Real-time watch WebSocket** — streams `status`, `log`, and `state` events from each device.
- **Home Assistant bridge** — devices appear as `binary_sensor`, `sensor`, `switch`, `light` entities.

## Entry points
- Marketing site: <https://devicesdk.com>
- Dashboard: <https://dash.devicesdk.com>
- REST API: <https://api.devicesdk.com> (Bearer auth)
- Interactive OpenAPI reference: <https://devicesdk.com/docs/api>
- CLI: `npm i -g @devicesdk/cli` → `devicesdk --help`
- Documentation: <https://devicesdk.com/docs>

## Related skills
- `devicesdk-api` — REST API details and authentication.
- `devicesdk-cli` — command reference and project layout.
- `devicesdk-firmware` — hardware support and flashing workflow.
