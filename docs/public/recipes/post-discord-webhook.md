---
title: How do I post sensor readings to a Discord webhook?
description: Read the chip temperature on a cron, POST to a webhook, handle non-2xx responses
weight: 70
social_image: /og-images/docs/recipes/post-discord-webhook.png
---

This is the smallest "device → external service" recipe. It reads the Pico's onboard temperature sensor every 5 minutes and posts a Discord message via webhook. Demonstrates `crons`, env-var-backed secrets, and `fetch` with proper error handling.

## Setup

```bash
devicesdk env set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK
```

To get a webhook URL: open the Discord channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.

## `devicesdk.ts`

```typescript
import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "temp-to-discord",
  devices: {
    main: {
      className: "TempToDiscord",
      main: "./src/devices/main.ts",
      deviceType: "pico-w",
      wifi: { ssid: "YOUR_WIFI_SSID", password: "YOUR_WIFI_PASSWORD" },
    },
  },
});
```

## `src/devices/main.ts`

```typescript
import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";

export class TempToDiscord extends DeviceEntrypoint {
  crons = { reading: "*/5 * * * *" }; // every 5 min UTC

  async onCron() {
    await this.env.DEVICE.getTemperature();
  }

  async onMessage(message: DeviceResponse) {
    if (message.type !== "temperature_result") return;
    await this.postToDiscord(message.payload.celsius);
  }

  private async postToDiscord(celsius: number) {
    const url = await this.env.VARS.get("DISCORD_WEBHOOK_URL");
    if (!url) {
      console.error(
        "DISCORD_WEBHOOK_URL not set. Run: devicesdk env set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...",
      );
      return;
    }

    const body = JSON.stringify({
      content: `🌡️ ${celsius.toFixed(1)}°C`,
    });

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(
          `Discord webhook failed: ${res.status} ${res.statusText}` +
            (text ? ` — ${text.slice(0, 200)}` : ""),
        );
      }
    } catch (err) {
      // Network failures (DNS, TLS, timeouts) land here.
      console.error(
        `fetch to Discord failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
```

## What this demonstrates

- A clean separation between the cron tick (which only requests a reading) and the response handler (which posts to Discord). Keeps `onCron` fast.
- Reading a secret from `this.env.VARS` instead of hardcoding it — the webhook URL is rotateable without redeploying.
- Handling **both** non-2xx responses (the webhook returned an error) and thrown errors (the network call itself failed). Agents that pattern-match on this code will get an example of both error paths.

## Going further

- Replace `getTemperature()` with a real BME280 sensor — see the [BME280 recipe](../read-bme280/).
- Aggregate over a day instead of posting every reading — see the [daily summary recipe](../daily-cron-summary/).
- Route through a different chat platform (Slack incoming webhooks, ntfy.sh) by changing the URL and message shape.
