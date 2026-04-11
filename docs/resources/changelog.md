---
title: Changelog
description: Latest releases and updates for DeviceSDK
social_image: /og-images/docs/resources/changelog.png
---

## April 11, 2026

- **Home Assistant integration** — expose DeviceSDK devices as native Home Assistant entities (sensors, switches, lights). Declare entities in `devicesdk.ts` under `ha.entities`; run `devicesdk deploy` to publish them. See the [Home Assistant guide](/docs/guides/home-assistant/).
- **Generic watch WebSocket** — new `GET /v1/projects/:projectId/devices/:deviceId/watch` endpoint delivers real-time status, log, and structured state events over a persistent WebSocket connection. The dashboard now uses this endpoint in place of the legacy SSE log stream. See the [Real-Time Watch guide](/docs/guides/real-time-watch/).
- **`emitState` SDK method** — publish structured state values from device scripts with `this.env.DEVICE.emitState(entity_id, value)`. Feeds custom telemetry into Home Assistant entities. See the [Emit State concept](/docs/concepts/emit-state/).
- SSE log stream endpoint (`GET /logs/stream`) is deprecated in favor of the watch WebSocket.

## December 27, 2025

- Private Beta milestone: expanded access and onboarding for early teams
- Pico W and Pico 2W are the officially supported hardware targets
- ESP32 support tracked as next hardware platform
