---
title: "Real-Time Watch WebSocket"
description: "Subscribe to a device's status, logs, and structured state events over a single long-lived WebSocket — the same primitive the dashboard and Home Assistant integration use."
url: http://localhost:1313/docs/guides/real-time-watch/
---

# Real-Time Watch WebSocket

> Subscribe to a device's status, logs, and structured state events over a single long-lived WebSocket — the same primitive the dashboard and Home Assistant integration use.


## Overview

The watch WebSocket is the canonical way to subscribe to a device's real-time events. A single connection delivers three categories of event:

- `status` — device connected/disconnected
- `log` — log entries from user code
- `state` — structured entity state changes (GPIO input, temperature, custom telemetry)

The endpoint is designed for always-on subscribers: the connection hibernates on the managed runtime between hardware events, so a dashboard tab, Home Assistant instance, or background watchdog can stay subscribed indefinitely at essentially zero cost.

## Endpoint

```
GET /v1/projects/:projectId/devices/:deviceId/watch
Upgrade: websocket
```

Each frame arrives as a single JSON object:

```json
{ "event": "status", "data": { "connected": true, "connectedSince": 1712345678901 } }
{ "event": "log",    "data": { "id": "...", "level": "info", "message": "...", "created_at": 1712345678902 } }
{ "event": "state",  "data": { "entity_id": "gpio_pin_15", "value": "low", "source": "gpio_state_changed" } }
```

## Authentication

- **Browser** — the browser sends the session cookie automatically on the WebSocket upgrade. No extra work.
- **API token** — pass the token as a query parameter: `wss://api.devicesdk.com/v1/projects/.../watch?token=dsdk_...`. This is how the Home Assistant integration authenticates.

## Quick test with `websocat`

```bash
websocat "wss://api.devicesdk.com/v1/projects/my-project/devices/my-device/watch?token=dsdk_..."
```

You should receive an initial `status` frame, then live `log` and `state` frames as the device emits them.

## When to use watch vs. the REST API

| Use case | Use |
|---|---|
| Dashboard tab showing live logs | Watch WebSocket |
| Home automation / always-on integration | Watch WebSocket |
| One-shot log query with pagination | `GET /logs` |
| One-shot connection status check | `GET /status` |
| Sending a command to hardware | `POST /command` |

The watch WebSocket is for reading real-time events. Commands still go through the REST endpoint.

## State events

State events are the structured alternative to parsing log text. The runtime automatically emits `state` events for three known hardware messages:

- `gpio_state_changed` → `entity_id: "gpio_pin_<pin>"`
- `pin_state_update` → `entity_id: "gpio_pin_<pin>_analog"`
- `temperature_result` → `entity_id: "temperature"`

User code can also emit custom state events from device scripts with `this.env.DEVICE.emitState(entity_id, value)` — see [Emit State](/docs/concepts/emit-state/) for details.

