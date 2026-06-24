---
title: "Platform Architecture"
description: "Understanding how DeviceSDK works end-to-end"
url: http://localhost:1313/docs/concepts/architecture/
---

# Platform Architecture

> Understanding how DeviceSDK works end-to-end


## Overview

DeviceSDK runs on a globally distributed runtime to provide low latency and scale for IoT applications.

```
┌──────────┐         ┌──────────────┐         ┌─────────────────┐
│  Device  │ ◄─────► │  WebSocket   │ ◄─────► │ Device Script   │
│ (Pico W) │  HTTPS  │  Connection  │         │ (Runtime)       │
└──────────┘         └──────────────┘         └─────────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  Dashboard   │
                     │   & Logs     │
                     └──────────────┘
```

## Component Overview

### Device Firmware

The firmware runs on your microcontroller (e.g., Raspberry Pi Pico W) and handles:
- WebSocket connection to edge
- Hardware abstraction (GPIO, ADC, I2C, etc.)
- Message serialization
- Automatic reconnection
- Credential management

### WebSocket Gateway

A persistent connection between device and runtime:
- TLS encrypted
- Binary message protocol
- Low latency (~50-200ms)
- Automatic keepalive
- Connection pooling

### Device Entrypoint

Your TypeScript code running on a serverless runtime:
- Handles device messages
- Sends commands to devices
- Connects to your chosen external services
- Fast cold starts and globally distributed

## Data Flow

### Device → Cloud

1. Device sends message over WebSocket
2. Gateway routes to your script
3. `onMessage()` is called
4. Your code processes message
5. Can trigger external APIs, store data, etc.

### Cloud → Device

1. Your code calls `env.DEVICE.send()`
2. Message queued for delivery
3. Sent over WebSocket to device
4. Device processes command
5. May respond with result

## Message Protocol

Messages are JSON-based and use a discriminated `type` field. Commands sent to the device match a typed schema; responses (events emitted by the device) match a parallel schema. For example, a GPIO write command:

```json
{
  "id": "01J9X…",
  "type": "set_gpio_state",
  "payload": { "pin": 25, "state": "high" }
}
```

You normally don't write these messages by hand — call typed helpers on `this.env.DEVICE` instead:

```typescript
await this.env.DEVICE.setGpioState(25, "high");
```

The full set of command and response types is defined in [`@devicesdk/core`](https://devicesdk.com/docs/concepts/device-api/) and surfaces as a discriminated union you can narrow in `onMessage`.

## Script Execution Model

Your device entrypoints run as:
- **Stateless functions** - No long-running processes
- **Event-driven** - Triggered by device events
- **Isolated** - Each request in separate context
- **Fast** - Typical execution < 10ms

## Persistent Storage

For state management:
- **KV Storage** - Per-device key-value storage
- **Logs** - Structured logging
- **Webhooks / APIs** - Call your own services for external persistence

## Device-to-Device Communication

Devices within the same project can call methods on each other via the serverless runtime:

```
┌──────────────┐         ┌────────────────────┐         ┌──────────────┐
│  Device A    │         │  Serverless Runtime │         │  Device B    │
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
- **Runtime-mediated** — RPC routes through the serverless runtime, never directly between devices
- **Same project only** — devices can only call other devices in the same project
- **Type-safe** — the CLI generates TypeScript types for autocomplete and compile-time checking
- **Request-response** — callers await the return value; errors propagate back

## Security Model

- **Device credentials** - Unique per device, embedded in firmware
- **TLS encryption** - All communication encrypted
- **Token authentication** - API access controlled by tokens
- **Isolation** - Scripts run in isolated contexts

## Deployment Model

When you deploy:
1. Code compiled to JavaScript
2. Uploaded to DeviceSDK
3. New version created (immutable)
4. Globally distributed in seconds
5. Devices reconnect to new version

## Scaling

DeviceSDK scales automatically:
- **Devices** - Millions supported
- **Messages** - No practical limit
- **Geography** - Global by default
- **Load** - Automatic distribution

No infrastructure management required.

## Next Steps

- [Device Entrypoints](/docs/concepts/entrypoints/) - Lifecycle and methods
- [Script Versioning](/docs/concepts/versioning/) - Deployment model

