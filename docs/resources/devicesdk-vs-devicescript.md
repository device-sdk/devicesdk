---
title: DeviceSDK vs Microsoft DeviceScript
description: "How DeviceSDK compares to Microsoft DeviceScript: execution model, firmware, iteration speed, and use cases. Server-side TypeScript vs on-device TypeScript bytecode."
social_image: /og-images/docs/resources/devicesdk-vs-devicescript.png
---

Microsoft DeviceScript and DeviceSDK both let you write TypeScript for microcontrollers — but they work in fundamentally different ways. Understanding the distinction helps you pick the right tool.

## The Core Difference

| | DeviceSDK | Microsoft DeviceScript |
|---|---|---|
| **Where your code runs** | Cloud (serverless runtime) | On the device (compiled bytecode) |
| **Firmware** | Pre-built — you never touch C | Custom build per project |
| **Language runtime** | Full Node.js-compatible JS engine | Restricted TypeScript bytecode VM |
| **Iteration speed** | `devicesdk deploy` — seconds, no device touch | Recompile + reflash on every change |
| **npm ecosystem** | Full access (`fetch`, `axios`, external APIs) | Restricted subset of the standard library |
| **Device stays online?** | Yes — device connects once and listens | Yes — runs standalone on device |
| **Internet access** | In the cloud script (no device code needed) | Requires separate HTTP component |
| **Multi-device logic** | Native (scripts can address any device) | One script per device |
| **Supported hardware** | ESP32, Raspberry Pi Pico W / 2W | Wide range (Seeed, ST, Nordic, etc.) |

## Execution Model

### DeviceSDK

Your TypeScript runs **in a globally distributed serverless runtime** — not on the microcontroller. The device runs pre-built firmware and maintains a persistent WebSocket connection to the cloud. When your script runs, it sends commands over that WebSocket and receives responses.

```
Cloud (your TypeScript) ←→ WebSocket ←→ Microcontroller (pre-built firmware)
```

This means:
- Full Node.js-compatible JavaScript — `fetch`, promises, async/await, all npm packages
- HTTP calls, database access, Discord webhooks, multi-device orchestration — all in the same script
- Update your logic in seconds with `devicesdk deploy` — the device never reboots

### Microsoft DeviceScript

DeviceScript compiles your TypeScript to a custom bytecode that runs **on the device itself**. The runtime is a small VM that executes on the microcontroller.

```
TypeScript → DeviceScript bytecode → compiled into device firmware → flashed to device
```

This means:
- A restricted TypeScript subset — not all npm packages are supported
- Code changes require recompile + reflash
- Internet access requires explicit HTTP/WiFi components
- Logic runs offline (no cloud dependency)

## When to Choose DeviceSDK

DeviceSDK is the better fit when you:

- Want to write standard TypeScript without learning a custom runtime
- Need to call external APIs (webhooks, databases, REST services) from your device logic
- Are iterating rapidly — deploy code changes in seconds without touching hardware
- Need multiple devices to coordinate or share state
- Want pre-built firmware — no toolchain setup, no C/C++
- Are building production systems that benefit from cloud-side logging, versioning, and fleet management

## When to Choose DeviceScript

DeviceScript may be a better fit when you:

- Need offline operation (device must work without internet)
- Target hardware not supported by DeviceSDK (Nordic, Seeed XIAO, etc.)
- Want code to run purely on-device with no cloud dependency
- Are already in the Jacdac / Microsoft MakeCode ecosystem

## Iteration Speed Comparison

One of the sharpest practical differences is iteration speed.

**DeviceSDK:**
```bash
# Edit your TypeScript script, then:
npx @devicesdk/cli deploy
# Done — new code is live in seconds. Device doesn't reboot.
```

**DeviceScript:**
```bash
# Edit your TypeScript, then:
# 1. Recompile DeviceScript
# 2. Rebuild firmware with the new bytecode
# 3. Flash to device (requires USB or OTA)
# Device restarts
```

For rapid prototyping or production deployments, DeviceSDK's redeploy-without-reflash model is significantly faster.

## npm Ecosystem Access

**DeviceSDK** scripts run in a full JavaScript runtime. Any npm package that works in a Node.js-compatible environment is available:

```typescript
import axios from 'axios';
import { format } from 'date-fns';
// All standard Node.js APIs, fetch, crypto, etc.
```

**DeviceScript** supports a restricted subset of the standard library. Many npm packages that depend on Node.js APIs (`fs`, `net`, `child_process`) are not available.

## Example: Sending a Webhook on Button Press

Both platforms can react to a GPIO button press, but the implementation differs:

### DeviceSDK

```typescript
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

export default class ButtonWebhook extends DeviceEntrypoint {
  async onDeviceConnect() {
    await this.env.DEVICE.configureGpioInputMonitoring(15, true, 'up');
  }

  async onMessage(message: DeviceResponse) {
    if (message.type === 'gpio_state_changed' && message.payload.state === 'low') {
      // Full fetch API — runs in the cloud, no device-side HTTP needed
      await fetch('https://hooks.slack.com/...', {
        method: 'POST',
        body: JSON.stringify({ text: 'Button pressed!' })
      });
    }
  }
}
```

### DeviceScript

Requires a separate HTTP client service and explicit WiFi management. The webhook call happens on the device itself, consuming device RAM and flash.

## Summary

DeviceSDK and DeviceScript solve different problems:

- **DeviceSDK** is for developers who want TypeScript as a first-class language with full npm access, fast iteration, and cloud-side control logic. The device is a hardware endpoint — your TypeScript orchestrates it from the cloud.

- **DeviceScript** is for developers who want to run TypeScript bytecode directly on-device, potentially offline, across a wide range of hardware.

If you've found DeviceScript through a "TypeScript IoT" search and want to control ESP32 or Raspberry Pi Pico hardware with standard TypeScript — calling APIs, deploying in seconds, no firmware builds — DeviceSDK is what you're looking for.

## Next Steps

- [Quickstart](/docs/quickstart/) — get DeviceSDK running in 15 minutes
- [Platform Architecture](/docs/concepts/architecture/) — understand how cloud-side control works
- [Hardware Compatibility](/docs/resources/hardware/) — supported devices
