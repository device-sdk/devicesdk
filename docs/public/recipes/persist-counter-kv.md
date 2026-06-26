---
title: How do I persist a counter across device reboots?
description: Use this.env.DEVICE.kv to keep state across reboots, deploys, and reconnects
weight: 30
social_image: /og-images/docs/recipes/persist-counter-kv.png
---

Device scripts are event-driven and stateless - between events, nothing in your class survives. To carry state forward (a counter, last-seen value, configuration), use the per-device KV.

## `devicesdk.ts`

```typescript
import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "boot-counter",
  devices: {
    main: {
      className: "BootCounter",
      main: "./src/devices/main.ts",
      deviceType: "pico-w",
      wifi: { ssid: "YOUR_WIFI_SSID", password: "YOUR_WIFI_PASSWORD" },
    },
  },
});
```

## `src/devices/main.ts`

```typescript
import { DeviceEntrypoint, OnboardLED } from "@devicesdk/core";

interface Counters {
  boots: number;
  lastBootAt: number;
}

export class BootCounter extends DeviceEntrypoint {
  async onDeviceConnect() {
    // Read existing state. kv.get returns undefined if the key was never set.
    const prev = (await this.env.DEVICE.kv.get<Counters>("counters")) ?? {
      boots: 0,
      lastBootAt: 0,
    };

    const next: Counters = {
      boots: prev.boots + 1,
      lastBootAt: Date.now(),
    };
    await this.env.DEVICE.kv.put("counters", next);

    console.log(
      `Boot #${next.boots} (previous boot was ${prev.lastBootAt ? new Date(prev.lastBootAt).toISOString() : "never"})`,
    );

    // Blink the LED `boots % 10` times so it's visible in the field.
    for (let i = 0; i < next.boots % 10; i++) {
      await this.env.DEVICE.setGpioState(OnboardLED, "high");
      await new Promise((r) => setTimeout(r, 100));
      await this.env.DEVICE.setGpioState(OnboardLED, "low");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
```

## What this demonstrates

- `this.env.DEVICE.kv.get<T>(key)` returns `T | undefined` - always handle the cold-start case.
- Values are JSON-serialised under the hood, so any JSON-safe shape (objects, arrays, numbers) works.
- Calling `kv.put` from `onDeviceConnect` is fine - the runtime hangs onto the call until the device handshake completes.

## What KV is and isn't

- **Per device.** Two devices in the same project have separate KV namespaces. To share state across devices, use inter-device RPC or persist to your own backend.
- **Persistent across reconnects, deploys, reboots.** A dropped WiFi link or a `devicesdk deploy` doesn't reset KV.
- **Not transactional across keys.** If you need to update two related values atomically, store them under one key as an object (as in the example).
- **Not real-time.** Reads are a few ms each - fine for events, not for tight loops. If you need sub-millisecond reads, keep the value in a `private` class field and write through to KV occasionally.

## Going further

- Reset the counter on a button press - combine with the [button recipe](../button-toggles-led/).
- Replicate state to your own backend on cron - combine with the [Discord recipe](../post-discord-webhook/).
