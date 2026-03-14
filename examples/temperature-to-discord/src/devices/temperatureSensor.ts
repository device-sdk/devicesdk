import { DeviceEntrypoint, DeviceResponse } from "@devicesdk/core";

// Discord webhook URL — set this to your Discord channel's webhook URL
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/YOUR_WEBHOOK_URL";

// Analog pin connected to temperature sensor output
const TEMP_PIN = 26; // GP26 (ADC0)

// Report temperature every 30 seconds
const REPORT_INTERVAL_MS = 30_000;

export class TemperatureSensor extends DeviceEntrypoint {
    async onDeviceConnect() {
        console.info("Temperature sensor connected - starting monitoring");

        // Configure the ADC pin to report temperature on an interval
        await this.env.DEVICE.sendCommand({
            type: "set_pin_config",
            payload: {
                pin: TEMP_PIN,
                mode: "analog",
                report_policy: "interval",
                report_interval_ms: REPORT_INTERVAL_MS,
            },
        });

        console.info(`Reporting temperature every ${REPORT_INTERVAL_MS / 1000}s`);
    }

    async onDeviceDisconnect() {
        console.info("Temperature sensor disconnected");
    }

    async onMessage(message: DeviceResponse) {
        if (message.type === "pin_state_update" && message.payload.pin === TEMP_PIN) {
            const rawValue = message.payload.value;

            // Convert raw ADC value (0–65535 on Pico) to voltage, then to °C
            // Using the MCP9700A formula: Vout = 500mV + 10mV/°C
            const voltage = (rawValue / 65535) * 3.3;
            const temperatureC = (voltage - 0.5) / 0.01;
            const temperatureF = temperatureC * 1.8 + 32;

            const message_text = `🌡️ Temperature: ${temperatureC.toFixed(1)}°C / ${temperatureF.toFixed(1)}°F`;
            console.info(message_text);

            // Post reading to Discord
            await this.postToDiscord(message_text);
        }
    }

    private async postToDiscord(content: string): Promise<void> {
        try {
            const response = await fetch(DISCORD_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });

            if (!response.ok) {
                console.error(`Discord webhook failed: ${response.status} ${response.statusText}`);
            }
        } catch (err) {
            console.error("Failed to post to Discord:", err);
        }
    }
}
