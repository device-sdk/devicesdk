---
title: "Frequently Asked Questions"
description: "Common questions about DeviceSDK"
---

# Frequently Asked Questions

> Common questions about DeviceSDK


## General

### What is DeviceSDK?

DeviceSDK is a free, open-source (AGPL-3.0), self-hosted IoT platform. You write TypeScript device scripts, run the DeviceSDK server on your own hardware (Raspberry Pi, NUC, NAS, any Docker host), and connect ESP32 and Pico microcontrollers to it over WebSocket. No cloud, no per-message billing, no vendor lock-in.

### How is this different from other IoT platforms?

- **TypeScript-first** — Full type safety and autocomplete for hardware APIs; catch wiring mistakes at compile time
- **Self-hosted** — Runs on a Raspberry Pi or any Docker host; your data never leaves your network
- **No breaking changes** — A device script that works today will work in five years; breaking changes are treated as bugs
- **Slow, deliberate releases** — Updates ship when there is something worth shipping, not on a weekly cadence
- **Compatibility flags** — When behavior must evolve, opt-in flags let you migrate on your own schedule
- **Developer-friendly** — Built-in local simulator, modern CLI tooling, inter-device RPC with full TypeScript types

### Do I need a cloud account or paid subscription?

No. DeviceSDK is entirely self-hosted and free. You run the server yourself — there is no SaaS component and no billing.

## Cost

### How much does it cost?

DeviceSDK is free and open source. You only pay for the hardware you already own (a Raspberry Pi, a NUC, or any Docker host). There are no subscriptions, no per-message billing, and no usage tiers.

### What does self-hosted mean?

It means you run the server yourself. The DeviceSDK Docker image contains everything — the REST API, device WebSockets, and the dashboard UI — in a single container. You own all the data.

## Supported Hardware

### What devices are supported?

Currently supported:
- Raspberry Pi Pico W
- Raspberry Pi Pico 2W
- ESP32 (ESP-IDF, all common variants including ESP32-C3 and ESP32-C61)

### Can I use a Raspberry Pi (full Linux computer)?

Not currently. DeviceSDK targets microcontrollers — devices running the DeviceSDK firmware over WebSocket. The *server* runs on a Raspberry Pi or any Linux/Docker host.

### Can I request hardware support?

Yes! Open an issue on GitHub or join the Discord community.

## Development

### Do I need physical hardware to get started?

No. The built-in simulator lets you test without hardware:
```bash
devicesdk dev
```

### Can I use JavaScript instead of TypeScript?

Yes, but TypeScript is recommended for better type safety and developer experience.

### What libraries can I use?

Most npm packages work. Runtime restrictions:
- No Node.js-specific APIs (fs, child_process, etc.)
- No native bindings
- No heavy computation (execution limits apply)

### Can I use external APIs?

Yes! Call any HTTP API from your device scripts:
```typescript
await fetch('https://api.example.com/data');
```

## Deployment

### How long does deployment take?

Typically 10-30 seconds to deploy globally.

### Can I rollback a deployment?

Yes. Rollback to any previous version instantly via the dashboard.

### How many devices can I have?

No limit on device count in any tier.

### Can I deploy from CI/CD?

Yes. Use the CLI with a token:
```bash
DEVICESDK_TOKEN=xxx devicesdk deploy
```

## Security

### How is data encrypted?

- All WebSocket connections use TLS 1.3
- Device credentials are unique per device
- API access requires authentication tokens

### Where is my data stored?

- Code runs on a globally distributed runtime
- Logs stored per your retention settings
- Device state in KV storage

### Can I use custom domains?

Not yet for device connections, but you can build web UIs on custom domains.

### Is my code isolated from other users?

Yes. Each project runs in isolated execution contexts.

## Connectivity

### Does my network need special configuration?

Most networks work out-of-box. Requirements:
- Allow outbound WebSocket (port 443)
- No captive portal blocking connections

### What's the expected latency?

Typically 50-200ms round-trip, depending on:
- Geographic distance
- Network quality
- Edge routing

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

Yes. Use any notification service:
- Email (Resend, SendGrid, etc.)
- SMS (Twilio)
- Push notifications
- Discord/Slack webhooks

### Can I build a dashboard?

Yes. Build web UIs with any frontend framework and host where you prefer.

### Is there a mobile app?

Not yet. The web dashboard is mobile-friendly.

## Limitations

### What are the execution limits?

- Script execution: 50ms CPU time recommended
- Message size: 64 KB max
- WebSocket connection: Persistent

### Can I run long computations?

For heavy computation:
- Offload to separate services/queues
- Keep device scripts lightweight

### Maximum message rate?

No hard limit, but billing increases with messages. Optimize for efficiency.

## Support

### How do I get help?

1. Check this FAQ and [documentation](/docs/)
2. Join [Discord community](https://discord.gg/WuNhbXGsBy)
3. Email support@devicesdk.com

### Is there paid support?

Enterprise plans include priority support. Contact sales for details.

### Where do I report bugs?

- GitHub issues for open source components
- Discord for community help
- Email for account/billing issues

## Roadmap

### What's coming next?

- ESP32 support
- More hardware platforms
- Enhanced simulator
- Mobile device apps
- Advanced analytics

### Can I influence the roadmap?

Yes! Share feedback in Discord or via email. We prioritize user-requested features.

### Is DeviceSDK open source?

Yes. The entire platform — server, CLI, firmware, dashboard, and website — is open source under AGPL-3.0. [View the repository on GitHub](https://github.com/device-sdk/devicesdk-monorepo).

## Migration

### Can I migrate from another platform?

Yes. We have migration guides for:
- AWS IoT Core
- Google Cloud IoT
- Azure IoT Hub

### Will you support MQTT?

We use WebSockets for performance on the distributed runtime. MQTT compatibility is being evaluated.

### Can I export my data?

Yes. All data can be exported via API or dashboard.

## Still Have Questions?

- [Join Discord](https://discord.gg/WuNhbXGsBy) for community help
- [Email support](mailto:support@devicesdk.com) for specific issues
- Check our [troubleshooting guide](/docs/resources/troubleshooting/)

