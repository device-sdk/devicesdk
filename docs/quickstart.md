---
title: Quickstart
description: Get from zero to your first deployment in under 15 minutes
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

## Step 3: View in Dashboard

Visit your [dashboard](https://dash.devicesdk.com) to:
- See your deployed projects
- Monitor device connections
- View message logs
- Manage device credentials
- Track version history

## Next Steps

Now that you have a working project:

- [**Your First Device**](/docs/first-device/) - Learn how to build device entrypoints
- [**CLI Reference**](/docs/cli/) - Explore all available commands
- [**Platform Architecture**](/docs/concepts/architecture/) - Understand how DeviceSDK works

## Need Help?

- [Join our Discord](https://discord.gg/WuNhbXGsBy) for community support
- [Check the FAQ](/docs/resources/faq/) for common questions
- [View troubleshooting guide](/docs/resources/troubleshooting/) if you encounter issues
