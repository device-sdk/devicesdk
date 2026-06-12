---
title: Platform Architecture
description: How the self-hosted DeviceSDK server, your devices, and the dashboard fit together
social_image: /og-images/docs/concepts/architecture.png
---

## Overview

DeviceSDK is a **self-hosted** IoT platform. You run a single server process on your own
hardware — a Raspberry Pi, a NUC, a NAS, or any Docker host — and your microcontrollers
connect to it over WebSocket. There is no cloud, no managed runtime, and no per-message
billing: it's one process on hardware you control.

```
┌──────────┐         ┌──────────────┐         ┌─────────────────┐
│  Device  │ ◄─────► │  WebSocket   │ ◄─────► │ Device Script   │
│ (Pico W) │   ws    │  Connection  │         │ (in-process)    │
└──────────┘         └──────────────┘         └─────────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  Dashboard   │
                     │   & Logs     │
                     └──────────────┘
                  (all served by one Bun
                   process on port 8080)
```

The server is a single **Bun** process (`@devicesdk/server`: Hono + Chanfana + Zod +
`bun:sqlite`). It listens on one port (default **8080**) and serves everything:

- the REST API under `/v1/*`
- the device WebSocket and watcher WebSocket
- the dashboard SPA, same-origin at `/`
- OpenAPI docs at `/api-docs`

It's distributed as a multi-arch Docker image (`ghcr.io/device-sdk/devicesdk`). All state
lives under `DATA_DIR` (`/data` in Docker): the SQLite database (`devicesdk.sqlite`, WAL
mode), deployed script bundles under `scripts/`, and firmware images under `firmwares/`.

## Component Overview

### Device Firmware

The firmware runs on your microcontroller (e.g., Raspberry Pi Pico W) and handles:
- WebSocket connection to your server
- Hardware abstraction (GPIO, ADC, I2C, etc.)
- Message serialization
- Automatic reconnection
- Credential management

The firmware connects to **your** server's host and port. On a LAN install with an explicit
port (e.g. `raspberrypi.local:8080`), it uses plain `ws://`; for a bare hostname it uses
TLS (`wss://`) on port 443.

### WebSocket Connection

A persistent connection between the device and your server:
- Binary/JSON message protocol
- Low latency on a LAN
- Automatic keepalive
- Optionally TLS-encrypted (see Security Model)

### Device Script

Your TypeScript code, running **in-process** inside the server:
- Handles device messages
- Sends commands to devices
- Connects to your chosen external services
- Maintains a per-device session that lives for the lifetime of the server process

Scripts are event-driven, not request-per-invocation: each device has one session, and the
server dispatches `onDeviceConnect` / `onMessage` / `onDeviceDisconnect` / `onCron` to it.

## Data Flow

### Device → Server

1. Device sends a message over WebSocket
2. The server routes it to the device's session
3. `onMessage()` is called on your script
4. Your code processes the message
5. It can trigger external APIs, store data in KV, etc.

### Server → Device

1. Your code calls `env.DEVICE.send()` (or a typed helper)
2. The command is sent over the WebSocket to the device
3. The device processes the command
4. It may respond with a result

## Message Protocol

Messages are JSON-based and use a discriminated `type` field. Commands sent to the device
match a typed schema; responses (events emitted by the device) match a parallel schema. For
example, a GPIO write command:

```json
{
  "id": "01J9X…",
  "type": "set_gpio_state",
  "payload": { "pin": 25, "state": "high" }
}
```

You normally don't write these messages by hand — call typed helpers on `this.env.DEVICE`
instead:

```typescript
await this.env.DEVICE.setGpioState(25, "high");
```

The full set of command and response types is defined in
[`@devicesdk/core`](https://devicesdk.com/docs/concepts/device-api/) and surfaces as a
discriminated union you can narrow in `onMessage`.

## Script Execution Model

Your device scripts run as **in-process** code on the server:
- **Per-device session** — one long-lived session per device, keyed by project + device
- **Event-driven** — handlers fire on connect, message, disconnect, and cron
- **User-owned** — your code runs on your own server; this is the trust model, not a sandbox
- **Serialized dispatch** — per-session handlers run in FIFO order, one at a time

Because scripts are not sandboxed serverless functions, there's no cold start and no global
distribution: they're plain TypeScript modules loaded into the Bun process you run.

## Persistent Storage

For state management:
- **KV Storage** - Per-device key-value storage (in `devicesdk.sqlite`)
- **Logs** - Structured logging, retained in SQLite
- **Webhooks / APIs** - Call your own services for external persistence

## Device-to-Device Communication

Devices within the same project can call methods on each other. The call is mediated by the
server, which holds both device sessions in-process:

```
┌──────────────┐         ┌────────────────────┐         ┌──────────────┐
│  Device A    │         │  The Server         │         │  Device B    │
│  (Sensor)    │ ──WS──► │                    │ ──WS──► │  (Light)     │
│              │         │  Sensor script:     │         │              │
│              │         │  this.env.DEVICES   │         │              │
│              │         │  ["light"].turnOn() │         │              │
│              │         │       │             │         │              │
│              │         │       ▼             │         │              │
│              │         │  Light script:      │         │              │
│              │         │  turnOn() executes  │         │              │
│              │         │  result flows back  │         │              │
└──────────────┘         └────────────────────┘         └──────────────┘
```

Key properties:
- **Server-mediated** — RPC routes through the server, never directly between devices
- **Same project only** — devices can only call other devices in the same project
- **Type-safe** — the CLI generates TypeScript types for autocomplete and compile-time checking
- **Request-response** — callers await the return value; errors propagate back

## Security Model

- **Device credentials** - Unique per device, embedded in firmware
- **Token authentication** - API access controlled by tokens; local email/password accounts
  (argon2id) back the dashboard and CLI login
- **Optional TLS** - On a trusted LAN you can run plain `ws://`/`http://`. To expose the
  server beyond your LAN, put it behind a reverse proxy (or tunnel) that terminates TLS —
  the firmware uses `wss://` automatically for bare hostnames on port 443
- **User-owned scripts** - Scripts run in-process because they're your own code on your own
  server; the trust boundary is the machine, not a per-script sandbox

## Deployment Model

When you deploy:
1. Code is compiled and bundled to JavaScript
2. The bundle is uploaded to **your** server
3. A new immutable version is created
4. Connected devices are sent a reboot and reconnect to the new version

Deploys go to the one server you run — there is no global rollout. A device picks up the new
version the next time it connects.

## Scaling

DeviceSDK scales to whatever your hardware can handle. A Raspberry Pi comfortably runs many
devices; a larger host runs more. There's no infrastructure-as-a-service layer and no
automatic horizontal scaling — capacity is the CPU, memory, and network of the box you run
the server on. For larger fleets, run on bigger hardware.

## Next Steps

- [Device Entrypoints](/docs/concepts/entrypoints/) - Lifecycle and methods
- [Script Versioning](/docs/concepts/versioning/) - Deployment model
