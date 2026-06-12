---
name: devicesdk-overview
description: DeviceSDK is a free, open-source (AGPL-3.0), self-hosted IoT platform. Users write TypeScript device scripts, deploy them via CLI to a server they run themselves, and flash firmware onto microcontrollers (Raspberry Pi Pico W, ESP32 family) that connect back over WebSocket. A Home Assistant integration exposes devices as native HA entities.
---

## What it is
- **Server side** — a single self-hosted Bun process (one port, default 8080) that executes a TypeScript entrypoint class **in-process** per device connection. You run it yourself on a Raspberry Pi, NUC, NAS, or any Docker host (`ghcr.io/device-sdk/devicesdk`). There is no cloud/SaaS component. The one process serves the REST API (`/v1/*`), device + watcher WebSockets, the dashboard SPA (same-origin), and OpenAPI docs at `/api-docs`.
- **Device side** — firmware for Pico and ESP32 with a HAL for GPIO, PWM, ADC, I2C, SPI, UART, and addressable LEDs (WS2812).
- **Real-time watch WebSocket** — streams `status`, `log`, and `state` events from each device.
- **Home Assistant bridge** — devices appear as `binary_sensor`, `sensor`, `switch`, `light` entities.

## Entry points
- Marketing site: <https://devicesdk.com>
- Source & releases: <https://github.com/device-sdk>
- Dashboard, REST API, and OpenAPI docs are served by **your own server** at `http://<server>:8080` (dashboard at `/`, API under `/v1/*`, docs at `/api-docs`). There is no hosted dashboard or API.
- Interactive OpenAPI reference (docs): <https://devicesdk.com/docs/api>
- CLI: `npm i -g @devicesdk/cli` → `devicesdk --help`
- Documentation: <https://devicesdk.com/docs>

## Related skills
- `devicesdk-api` — REST API details and authentication.
- `devicesdk-cli` — command reference and project layout.
- `devicesdk-firmware` — hardware support and flashing workflow.
