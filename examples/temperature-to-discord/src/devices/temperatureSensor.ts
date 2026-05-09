import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";

/**
 * Reads the Pico W's onboard temperature sensor every 5 minutes (UTC) and
 * posts the value to a Discord channel via webhook. The webhook URL is read
 * from the `DISCORD_WEBHOOK_URL` env var, set with:
 *
 *   devicesdk env set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
 */
export class TemperatureSensor extends DeviceEntrypoint {
  // Run every 5 minutes UTC. Edit to taste.
  crons = { reading: "*/5 * * * *" };

  async onCron(_name: string) {
    // Ask the device for its current temperature. The result arrives
    // asynchronously as a `temperature_result` event, handled in onMessage.
    await this.env.DEVICE.getTemperature();
  }

  async onMessage(message: DeviceResponse) {
    if (message.type !== "temperature_result") return;
    await this.postToDiscord(message.payload.celsius);
  }

  private async postToDiscord(celsius: number) {
    const webhookUrl = await this.env.VARS.get("DISCORD_WEBHOOK_URL");
    if (!webhookUrl) {
      console.error(
        "DISCORD_WEBHOOK_URL env var is not set. Run: devicesdk env set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...",
      );
      return;
    }

    const body = JSON.stringify({
      content: `🌡️ Temperature reading: **${celsius.toFixed(1)}°C**`,
    });

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.error(
          `Discord webhook failed: ${response.status} ${response.statusText}` +
            (text ? ` — ${text.slice(0, 200)}` : ""),
        );
      }
    } catch (err) {
      console.error("Failed to post to Discord:", err);
    }
  }
}
