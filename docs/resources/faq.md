---
title: Frequently Asked Questions
description: Common questions about DeviceSDK
social_image: /og-images/docs/resources/faq.png
---

## General

### What is DeviceSDK?

DeviceSDK is a platform for building IoT applications with TypeScript. It runs your code on a globally distributed runtime, providing low-latency communication with devices worldwide.

### How is this different from other IoT platforms?

- **TypeScript-first** - Full TypeScript support, not just configuration
- **Cloud-side logic** - Your script runs in the cloud and talks to your device over WebSocket — no reflashing to update behavior
- **Distributed execution** - Code runs globally, near your devices
- **Developer-friendly** - Built-in simulator, modern tooling
- **Pay per message** - No uptime charges
- **Simple integration** - Use your preferred APIs and services

### Do I need to know C or C++ to use DeviceSDK?

No. DeviceSDK ships pre-built firmware for ESP32 and Raspberry Pi Pico — you never touch C or C++. All your logic is written in TypeScript and runs in the cloud. The firmware is open source, but you don't need to modify it.

### How is DeviceSDK different from Arduino?

Arduino requires you to write C/C++ and flash new code to the device every time you make a change. With DeviceSDK, your TypeScript script runs in the cloud and sends commands to your device over a persistent WebSocket connection. You can update and redeploy your logic in seconds without touching the device.

### How is DeviceSDK different from ESPHome?

ESPHome uses YAML to configure smart home automations that run on-device. DeviceSDK is a general-purpose IoT platform for writing arbitrary TypeScript logic — HTTP calls, data processing, multi-device orchestration, conditional workflows — that runs in the cloud and controls hardware in real time. It's not limited to home automation use cases.

### Does it work with MicroPython?

No. DeviceSDK uses its own pre-built firmware (written in C/C++) that handles the WebSocket connection to the cloud. Your application code is TypeScript running server-side — not Python on the device. This approach gives you faster iteration (no reflash cycle) and access to the full npm ecosystem.

### Can I use DeviceSDK for production or commercial projects?

Yes. DeviceSDK is designed for production use. It supports multiple devices per project, API tokens for CI/CD, cron-based scheduling, fleet management via the dashboard, and persistent KV storage. The paid tier is $5/month for up to 5 million messages.

### Do I need to know any specific cloud platform?

No. DeviceSDK provides a simple API and does not require provider-specific knowledge.

## Pricing

### How much does it cost?

- **Free tier**: 500 messages/day free
- **Paid tier**: Starting at $5/month, includes 5 million messages/month. Additional messages at $3 per million.

See [pricing page](/pricing/) for details.

### What counts as a message?

Any communication between your code and device:
- Commands sent to device (1 message)
- Data received from device (1 message)

### Do I pay for offline devices?

No. You only pay for messages sent and received. Offline devices cost nothing.

### Can I set spending limits?

Yes. Configure daily and monthly limits in the dashboard to avoid surprises.

## Supported Hardware

### What devices are supported?

Currently supported:
- Raspberry Pi Pico W
- Raspberry Pi Pico 2 W
- ESP32-C61 (ESP32 series)

### Can I use Raspberry Pi (full computer)?

Not yet. DeviceSDK targets microcontrollers, not Linux computers.

### Can I request hardware support?

Yes! Join our [Discord](https://discord.gg/WuNhbXGsBy) and let us know what you need.

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

Some components are open source. Check our [GitHub](https://github.com/device-sdk).

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
