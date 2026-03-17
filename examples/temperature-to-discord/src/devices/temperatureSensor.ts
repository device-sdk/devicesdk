import { DeviceEntrypoint } from "@devicesdk/core";

export class TemperatureSensor extends DeviceEntrypoint {
	async onDeviceConnect() {
		console.log("Temperature sensor connected");
	}

	async onDeviceDisconnect() {
		console.log("Temperature sensor disconnected");
	}

	async sendTemperatureToDiscord(temperatureCelsius: number) {
		const webhookUrl = await this.env.VARS.get("DISCORD_WEBHOOK_URL");
		if (!webhookUrl) {
			console.error(
				"DISCORD_WEBHOOK_URL env var is not set. Run: devicesdk env set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...",
			);
			return;
		}

		const message = `🌡️ Temperature reading: **${temperatureCelsius.toFixed(1)}°C**`;

		try {
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: message }),
			});
			if (!response.ok) {
				console.error(`Discord webhook failed: ${response.status}`);
			}
		} catch (err) {
			console.error("Failed to post to Discord:", err);
		}
	}
}
