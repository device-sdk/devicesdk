---
title: "How do I send a daily summary on a cron schedule?"
description: "Declare a UTC cron, accumulate values in KV, post a summary once per day"
---

# How do I send a daily summary on a cron schedule?

> Declare a UTC cron, accumulate values in KV, post a summary once per day


A common pattern for environmental devices: sample frequently, aggregate, send once per day.

## `devicesdk.ts`

```typescript
import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "daily-summary",
  devices: {
    main: {
      className: "DailySummary",
      main: "./src/devices/main.ts",
      deviceType: "pico-w",
      wifi: { ssid: "YOUR_WIFI_SSID", password: "YOUR_WIFI_PASSWORD" },
    },
  },
});
```

Then set the webhook URL once:

```bash
devicesdk env set SUMMARY_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

## `src/devices/main.ts`

```typescript
import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";

interface Window {
  startedAt: number;
  count: number;
  sumC: number;
  minC: number;
  maxC: number;
}

const FRESH: Window = {
  startedAt: 0,
  count: 0,
  sumC: 0,
  minC: Number.POSITIVE_INFINITY,
  maxC: Number.NEGATIVE_INFINITY,
};

export class DailySummary extends DeviceEntrypoint {
  crons = {
    sample: "*/15 * * * *", // every 15 min UTC — collect a reading
    summary: "0 8 * * *",    // every day at 08:00 UTC — post the summary
  };

  async onCron(name: string) {
    if (name === "sample") {
      await this.env.DEVICE.getTemperature();
    } else if (name === "summary") {
      await this.postSummary();
    }
  }

  async onMessage(message: DeviceResponse) {
    if (message.type !== "temperature_result") return;
    const w = (await this.env.DEVICE.kv.get<Window>("window")) ?? {
      ...FRESH,
      startedAt: Date.now(),
    };
    const c = message.payload.celsius;
    const next: Window = {
      startedAt: w.startedAt || Date.now(),
      count: w.count + 1,
      sumC: w.sumC + c,
      minC: Math.min(w.minC, c),
      maxC: Math.max(w.maxC, c),
    };
    await this.env.DEVICE.kv.put("window", next);
  }

  private async postSummary() {
    const w = await this.env.DEVICE.kv.get<Window>("window");
    if (!w || w.count === 0) {
      console.log("No samples in window — skipping summary.");
      return;
    }
    const url = await this.env.VARS.get("SUMMARY_WEBHOOK_URL");
    if (!url) {
      console.error("SUMMARY_WEBHOOK_URL not set — run `devicesdk env set`.");
      return;
    }

    const avg = (w.sumC / w.count).toFixed(1);
    const body = JSON.stringify({
      content: `📊 Daily summary: ${w.count} samples, avg ${avg}°C (min ${w.minC.toFixed(1)}, max ${w.maxC.toFixed(1)})`,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      console.error(`Webhook POST failed: ${res.status} ${res.statusText}`);
      return;
    }

    // Reset the window for the next day.
    await this.env.DEVICE.kv.put("window", { ...FRESH, startedAt: Date.now() });
  }
}
```

## What this demonstrates

- Multiple named crons in one device.
- Accumulating state in KV across many invocations (the runtime is stateless — your class instance does *not* persist between events).
- Posting to an external webhook with a properly-handled non-2xx response.
- Resetting the aggregation window after a successful post.

## Notes

- Crons fire in UTC. Pick a time that lines up with your timezone — `0 8 * * *` is 08:00 UTC, which is 09:00 BST or 03:00 CDT.
- If the webhook is down at 08:00, the script logs the failure and **doesn't reset the window**. The next day's run will include yesterday's samples too — consider whether that matches your intent.
- For multiple devices contributing to one summary, see the [two-device RPC recipe](../two-devices-rpc/).

