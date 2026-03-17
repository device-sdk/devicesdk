# temperature-to-discord

A DeviceSDK example that reads temperature from a sensor and posts readings to a Discord channel via webhook.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set your Discord webhook URL

Store the webhook URL as an environment variable — never hardcode it in source:

```bash
npx @devicesdk/cli env set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL
```

To get a Discord webhook URL: open your Discord channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.

### 3. Deploy

```bash
npx @devicesdk/cli deploy
```

### 4. Connect your device

Flash firmware onto your microcontroller and connect it to the deployed project. When `sendTemperatureToDiscord()` is called from your device firmware, it will post the reading to Discord.

## How it works

The device script reads the webhook URL from `this.env.VARS` at runtime:

```typescript
const webhookUrl = await this.env.VARS.get("DISCORD_WEBHOOK_URL");
```

This keeps the secret out of your source code and out of your script bundle. You can rotate the URL at any time with `devicesdk env set` — changes take effect on the next device reconnect or deploy.

## Environment variables reference

| Variable | Description |
|---|---|
| `DISCORD_WEBHOOK_URL` | Discord incoming webhook URL for the target channel |
