---
title: Quickstart
description: "Get started with DeviceSDK in 15 minutes. Write a TypeScript device script, test it in the local simulator, and deploy to your ESP32 or Raspberry Pi Pico W."
social_image: /og-images/docs/quickstart.png
---

## Prerequisites

- **Node.js 22 or newer** - [Download Node.js](https://nodejs.org/)
- A DeviceSDK account - [Sign up free](https://dash.devicesdk.com)

## Step 1: Create Your First Project

Initialize a new project:

```bash
npx @devicesdk/cli init hello-world
```

This creates a new directory with:
- `devicesdk.ts` - Project configuration
- `src/devices/` - Your device entrypoints
- Example device code to get started

Navigate into your project:

```bash
cd hello-world
```

## Step 2: Deploy

Deploy your code to the edge:

```bash
npx @devicesdk/cli deploy
```

Your code is now running on DeviceSDK network, ready to handle real device connections.

## Step 3: Stream Logs

Tail device output directly from the terminal — the recommended debugging workflow after deploying:

```bash
npx @devicesdk/cli logs <project-id> <device-id> --tail
```

New log entries stream in as they arrive. Press **Ctrl-C** to stop. See [`devicesdk logs`](/docs/cli/logs/) for filtering by level and other options.

## Step 4: View in Dashboard

Visit your [dashboard](https://dash.devicesdk.com) to:
- See your deployed projects
- Monitor device connections
- View message logs
- Manage device credentials
- Track version history

## Step 4: Store Secrets with Environment Variables

Keep API keys and credentials out of your source code using project-scoped environment variables:

```bash
npx @devicesdk/cli env set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

Access them in your device script:

```typescript
const webhookUrl = await this.env.VARS.get("DISCORD_WEBHOOK_URL");
```

See [**Environment Variables**](/docs/concepts/env-vars/) for the full reference.

## Next Steps

Now that you have a working project:

- [**Your First Device**](/docs/first-device/) - Learn how to build device entrypoints
- [**CLI Reference**](/docs/cli/) - Explore all available commands
- [**Environment Variables**](/docs/concepts/env-vars/) - Store secrets outside your code
- [**Platform Architecture**](/docs/concepts/architecture/) - Understand how DeviceSDK works

## Need Help?

- [Join our Discord](https://discord.gg/WuNhbXGsBy) for community support
- [Check the FAQ](/docs/resources/faq/) for common questions
- [View troubleshooting guide](/docs/resources/troubleshooting/) if you encounter issues
