---
title: Frequently Asked Questions
description: Common questions about DeviceSDK
social_image: /og-images/docs/resources/faq.png
---

## General

### What is DeviceSDK?

DeviceSDK is a self-hosted, open-source platform for building IoT applications with TypeScript. You write device scripts, deploy them to a server you run yourself, and your microcontrollers (ESP32/Pico) connect to that server over WebSocket. The whole stack ships as a single Docker image.

### How is this different from other IoT platforms?

- **TypeScript-first** - Full TypeScript support, not just configuration
- **Self-hosted** - One Bun server on your hardware; no cloud account, no vendor lock-in
- **Open source** - AGPL-3.0; read, modify, and run the code yourself
- **Developer-friendly** - Built-in simulator, modern tooling
- **Your data stays yours** - everything lives under `DATA_DIR` on your machine

### Is DeviceSDK free?

Yes. DeviceSDK is free and open source under the **AGPL-3.0** license. There are no plans, tiers, message quotas, or usage billing — you run the server on your own hardware and it's yours.

### Do I need to know any specific cloud platform?

No. DeviceSDK runs anywhere Docker (or Bun) runs: a Raspberry Pi, a NUC, a NAS, or any Linux box.

## Running the server

### Where does it run?

Anywhere you can run the Docker image `ghcr.io/device-sdk/devicesdk` — Raspberry Pi, NUC, NAS, or a plain Docker host. It's a single Bun process listening on one port (default **8080**).

### How do I start it?

```bash
docker compose up -d
```

The server then serves the REST API, the device and watcher WebSockets, and the dashboard UI all on `http://<server>:8080`.

### Where is my data stored?

All state lives under `DATA_DIR` (default `./data`, `/data` inside Docker):

- `devicesdk.sqlite` — the SQLite database (WAL mode)
- `scripts/` — your deployed device script bundles
- `firmwares/` — cached firmware images

Back up that directory and you've backed up everything.

### Does the server phone home?

No. There is no telemetry and no phone-home in the server. Any optional integration is opt-in via environment config.

## Accounts & access

### How do I sign in?

The server uses local email/password accounts (hashed with argon2id). Open the dashboard at `http://<server>:8080` and register. The **first account you create becomes the admin**.

### How do I stop others from registering?

Set `ALLOW_REGISTRATION=false`. After the first admin account exists, this closes signups so no one else can register on your server.

### How does the CLI authenticate?

Point the CLI at your server and log in:

```bash
devicesdk login --host http://<server>:8080
```

Credentials are stored at `~/.devicesdk/credentials.json`. For CI, set `DEVICESDK_TOKEN` (and `DEVICESDK_API_URL` to your server).

## Supported Hardware

### What devices are supported?

- Raspberry Pi Pico W
- Raspberry Pi Pico 2W
- ESP32 (classic)
- ESP32-C3
- ESP32-C61

See the [Hardware Compatibility](/docs/hardware/) pages for per-board details.

### Can I use Raspberry Pi (full computer)?

The Pi (or any Linux box) is what you run the **server** on. The device scripts target microcontrollers, not Linux computers.

### Can I request hardware support?

Yes! Join our [Discord](https://discord.gg/WuNhbXGsBy) or open an issue on [GitHub](https://github.com/device-sdk/devicesdk-monorepo/issues).

## Development

### Do I need physical hardware to get started?

No. The built-in simulator lets you test without hardware:

```bash
devicesdk dev
```

### Can I use JavaScript instead of TypeScript?

Yes, but TypeScript is recommended for better type safety and developer experience.

### What libraries can I use?

Device scripts run **in-process** on your server (Bun). Most JavaScript/TypeScript libraries work. Keep scripts lightweight — they handle device events, not heavy batch computation.

### Can I use external APIs?

Yes! Call any HTTP API from your device scripts:

```typescript
await fetch('https://api.example.com/data');
```

## Deployment

### How do I deploy a script?

```bash
devicesdk deploy
```

This uploads your built script bundle to your server, which stores it under `DATA_DIR/scripts/` as a new immutable version.

### Can I rollback a deployment?

Yes. Rollback to any previous version via the dashboard.

### How many devices can I have?

There's no built-in limit — you're bound only by your own hardware.

### Can I deploy from CI/CD?

Yes. Point the CLI at your server and use a token:

```bash
DEVICESDK_API_URL=http://<server>:8080 DEVICESDK_TOKEN=xxx devicesdk deploy
```

## Security

### How do connections work?

- Devices connect to your server over WebSocket. When the configured host includes an explicit port (e.g. `ws://<server>:8080`), firmware uses plain `ws://` — typical for a LAN install. For a bare hostname behind a TLS terminator, it uses TLS on 443.
- API access requires authentication tokens.
- Device credentials are unique per device, embedded at flash time.

### Is my code isolated from other users?

Device scripts are **your** code running on **your** server — there are no other tenants. The trust model is single-operator: user-owned code on user-owned hardware. Within a project, devices can call each other's public methods (same-project RPC).

### Can I expose the server beyond my LAN?

Yes, but put it behind a reverse proxy or TLS terminator (or wait for the planned optional-HTTPS support — see the [roadmap](https://github.com/device-sdk/devicesdk-monorepo/blob/main/ROADMAP.md)). The server itself speaks HTTP on one port by default.

## Connectivity

### Does my network need special configuration?

For a LAN install, devices just need to reach your server's host and port over WiFi. Make sure your WiFi is 2.4GHz (5GHz is not supported) and that nothing on the network blocks the server's port.

### What if my device loses connection?

Devices automatically reconnect with exponential backoff. Your `onDeviceConnect` is called again after reconnection.

### Can devices communicate with each other?

Yes! Devices in the same project can call methods on each other with full type safety:

```typescript
import type { Env } from '../../devicesdk-env';

export class Sensor extends DeviceEntrypoint<Env> {
  async onMessage(message: DeviceResponse) {
    // Call a method on another device — fully typed with autocomplete
    const result = await this.env.DEVICES['light-controller'].turnOn();
    console.info('Light status:', result.status);
  }
}
```

The CLI generates `devicesdk-env.d.ts` with types for all devices in your project. Methods that only use KV storage work even when the target device's hardware is offline. See the [Inter-Device Communication Guide](/docs/guides/inter-device-communication/) for a full walkthrough.

## Features

### Can I send notifications?

Yes. Call any notification service from your device scripts:

- Email (Resend, SendGrid, etc.)
- SMS (Twilio)
- Push notifications
- Discord/Slack webhooks

### Can I integrate with Home Assistant?

Home Assistant integration is the flagship item on the [roadmap](https://github.com/device-sdk/devicesdk-monorepo/blob/main/ROADMAP.md). The server already persists Home Assistant entity declarations per device and streams `state` frames over the watch WebSocket.

### Is there a mobile app?

Not yet. The web dashboard is mobile-friendly.

## Support

### How do I get help?

1. Check this FAQ and the [documentation](/docs/)
2. Join the [Discord community](https://discord.gg/WuNhbXGsBy)
3. Open an issue on [GitHub](https://github.com/device-sdk/devicesdk-monorepo/issues)

### Where do I report bugs?

- GitHub issues for bugs and feature requests
- Discord for community help

## Roadmap

### What's coming next?

- **Home Assistant integration** (flagship): a HACS custom integration and, later, an official add-on.
- mDNS/zeroconf discovery so the CLI and HA can find your server without typing an IP.
- Backup/restore for `/data`.
- Optional HTTPS for installs exposed beyond the LAN.
- Firmware OTA updates.

See the full [roadmap](https://github.com/device-sdk/devicesdk-monorepo/blob/main/ROADMAP.md) for details.

### Can I influence the roadmap?

Yes! Share feedback in Discord or via GitHub issues. It's open source — pull requests welcome.

### Is DeviceSDK open source?

Yes — the entire platform is open source under AGPL-3.0. See our [GitHub](https://github.com/device-sdk/devicesdk-monorepo/issues).

## Still Have Questions?

- [Join Discord](https://discord.gg/WuNhbXGsBy) for community help
- [Open a GitHub issue](https://github.com/device-sdk/devicesdk-monorepo/issues) for bugs or features
- Check our [troubleshooting guide](/docs/resources/troubleshooting/)
