---
title: Quickstart
description: Get from zero to your first deployment in under 15 minutes
social_image: /og-images/docs/quickstart.png
---

## Prerequisites

- **A running DeviceSDK server** - you host it yourself. [Step 1](#step-1-run-the-server) below stands one up with Docker Compose in a couple of minutes.
- **Node.js 22 or newer** - [Download Node.js](https://nodejs.org/) - for the CLI.

## Step 1: Run the Server

DeviceSDK is self-hosted: you run the server, and everything (API, dashboard, device WebSockets) lives in one process on one port. The quickest path is Docker Compose:

```bash
docker compose up -d
```

Open `http://localhost:8080` in your browser and **create the first account** - the first registered user becomes the admin. After that you can set `ALLOW_REGISTRATION=false` to close signups.

The server runs anywhere Docker does - Raspberry Pi, NUC, or NAS. Behind an HTTPS reverse proxy, also set `SECURE_COOKIES=true`. State persists under `DATA_DIR` (`/data` in the container).

The server advertises itself over **mDNS** as `devicesdk.local`, so once it's up you can reach it at `http://devicesdk.local:8080` from any machine on the LAN - no static IP needed. To run more than one DeviceSDK server on the same network, give each a distinct name with `MDNS_HOSTNAME` (e.g. `devicesdk-garage` → `devicesdk-garage.local`), or set `MDNS_ENABLED=false` to turn it off.

## Step 2: Connect the CLI to Your Server

Point the CLI at the server you just started and authenticate:

```bash
npx @devicesdk/cli login --host http://localhost:8080
```

This runs a browser device-code flow against **your** server and saves an access/refresh token plus the host to `~/.devicesdk/credentials.json`. Replace `localhost` with the server's hostname or LAN IP when the CLI runs on a different machine.

## Step 3: Create Your First Project

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

## Step 4: Deploy

Deploy your code to your server:

```bash
npx @devicesdk/cli deploy
```

Your scripts are uploaded to your server as a new immutable version, and connected devices reconnect to it.

## Step 5: Stream Logs

Tail device output directly from the terminal - the recommended debugging workflow after deploying:

```bash
npx @devicesdk/cli logs <project-id> <device-id> --tail
```

New log entries stream in as they arrive. Press **Ctrl-C** to stop. See [`devicesdk logs`](/docs/cli/logs/) for filtering by level and other options.

## Step 6: View in Dashboard

Open your server's URL - `http://localhost:8080` (or your server's hostname) - to reach the dashboard your server serves. From there you can:
- See your deployed projects
- Monitor device connections
- View message logs
- Manage device credentials and API tokens
- Track version history

## Step 7: Store Secrets with Environment Variables

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
