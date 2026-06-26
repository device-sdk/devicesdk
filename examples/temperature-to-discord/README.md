# temperature-to-discord

A DeviceSDK example that reads the Pico W's onboard temperature sensor every 5 minutes and posts the reading to a Discord channel via webhook.

## How it works

```
┌────────────┐   cron     ┌────────────┐  getTemperature()  ┌─────────┐
│  Pico W    │ ◄────────  │  Device    │ ─────────────────► │  Pico   │
│ firmware   │            │  Script    │                    │ HW      │
└────────────┘            └────────────┘                    └─────────┘
                                ▲                                │
                                │  temperature_result event      │
                                └────────────────────────────────┘
                                │
                                ▼
                         POST → Discord webhook
```

- A `crons` declaration fires `onCron` every 5 minutes (UTC).
- `onCron` calls `this.env.DEVICE.getTemperature()` to ask the firmware for a reading.
- The firmware emits a `temperature_result` event, which arrives in `onMessage`.
- The script reads the Discord webhook URL from `this.env.VARS` and POSTs.

The full source is **44 lines**: see [`src/devices/temperatureSensor.ts`](./src/devices/temperatureSensor.ts).

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set your Discord webhook URL

Store the webhook URL as a project-scoped environment variable - never hardcode it in source:

```bash
npx @devicesdk/cli env set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL
```

To get a Discord webhook URL: open your Discord channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.

### 3. Configure WiFi

Edit `devicesdk.ts` and replace the `YOUR_WIFI_SSID` / `YOUR_WIFI_PASSWORD` placeholders with the credentials your Pico W will join.

### 4. Deploy

```bash
npx @devicesdk/cli deploy
```

### 5. Flash your Pico W

Plug your Pico W in over USB, hold the **BOOTSEL** button, and run:

```bash
npx @devicesdk/cli flash temperatureSensor
```

The device will join your WiFi, connect to DeviceSDK, and start posting to Discord on the next cron tick (within 5 minutes).

## Customizing

- **Cron schedule** - change `crons = { reading: "*/5 * * * *" }` in `temperatureSensor.ts`. Standard 5-field cron in UTC.
- **External sensor** - swap `getTemperature()` (which uses the Pico's built-in sensor) for `i2cRead(...)` against a BME280 or DHT22 if you want better accuracy. See the [I2C cookbook recipe](https://devicesdk.com/docs/recipes/read-bme280/).
- **Different chat platform** - replace the `fetch` URL with a Slack incoming webhook, ntfy.sh topic, or anything that accepts a JSON POST.

## Environment variables reference

| Variable | Description |
|---|---|
| `DISCORD_WEBHOOK_URL` | Discord incoming webhook URL for the target channel |
