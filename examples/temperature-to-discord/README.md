# Temperature to Discord Example

An example DeviceSDK project that reads temperature from an analog sensor connected to a Raspberry Pi Pico W and posts readings to a Discord channel via webhook.

## What it does

- Reads analog voltage from a temperature sensor (e.g. MCP9700A) on GP26 every 30 seconds
- Converts the raw ADC value to °C and °F using the sensor's transfer function
- Posts the reading to a Discord channel via an incoming webhook

## Wiring

| Component | Pico W Pin |
|-----------|------------|
| Sensor Vout | GP26 (ADC0) |
| Sensor VCC | 3.3V |
| Sensor GND | GND |

This example is wired for the **MCP9700A** (Microchip low-power linear temperature sensor). For other sensors, update the conversion formula in `temperatureSensor.ts`.

## Setup

1. **Create a Discord webhook** — in your Discord server, go to *Server Settings → Integrations → Webhooks* and create a new webhook. Copy the webhook URL.

2. **Edit `src/devices/temperatureSensor.ts`** — replace `YOUR_WEBHOOK_URL` in the `DISCORD_WEBHOOK_URL` constant with your actual webhook URL.

3. **Edit `devicesdk.config.ts`** — replace `YOUR_WIFI_SSID` and `YOUR_WIFI_PASSWORD` with your Wi-Fi credentials.

4. **Deploy and flash**:
   ```bash
   # Deploy the device script
   pnpm --filter @devicesdk/example-temperature deploy

   # Flash the firmware onto your Pico W (hold BOOTSEL while connecting USB)
   pnpm --filter @devicesdk/example-temperature flash
   ```

## Configuration

| Constant | Default | Description |
|----------|---------|-------------|
| `TEMP_PIN` | `26` | GPIO pin connected to the sensor output (ADC0) |
| `REPORT_INTERVAL_MS` | `30000` | How often to read and report temperature (ms) |
| `DISCORD_WEBHOOK_URL` | — | Your Discord incoming webhook URL |
