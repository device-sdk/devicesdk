---
title: "Concepts"
description: "Understand how DeviceSDK works"
url: http://localhost:1313/docs/concepts/
---

# Concepts

> Understand how DeviceSDK works


Foundational concepts you'll meet across the CLI, dashboard, and SDK:

- [Platform Architecture](/docs/concepts/architecture/) — how the runtime, devices, and dashboard fit together
- [Project & Device Identifiers](/docs/concepts/identifiers/) — what `projectId` and the device key in `devicesdk.ts` mean
- [Entrypoints](/docs/concepts/entrypoints/) — the `DeviceEntrypoint` class and lifecycle methods
- [Versioning](/docs/concepts/versioning/) — how deployed scripts are versioned and rolled back
- [Environment Variables](/docs/concepts/env-vars/) — project-scoped secrets via `this.env.VARS`
- [Cron Scheduling](/docs/concepts/cron-scheduling/) — declaring scheduled handlers
- [`emitState`](/docs/concepts/emit-state/) — publishing structured telemetry to watchers
- [Rate Limits](/docs/concepts/rate-limits/) — what gets throttled and when


## Pages in this section

- [Device API reference](http://localhost:1313/docs/concepts/device-api/index.md) — Every method on this.env.DEVICE — GPIO, PWM, I2C, SPI, UART, KV, watchdog
- [Platform Architecture](http://localhost:1313/docs/concepts/architecture/index.md) — Understanding how DeviceSDK works end-to-end
- [Project & Device Identifiers](http://localhost:1313/docs/concepts/identifiers/index.md) — How project slugs and device slugs map to your devicesdk.ts config
- [Cron Scheduling](http://localhost:1313/docs/concepts/cron-scheduling/index.md) — Schedule recurring work in device scripts using cron expressions
- [Device Entrypoints](http://localhost:1313/docs/concepts/entrypoints/index.md) — Understanding device entrypoint lifecycle and methods
- [Emit State](http://localhost:1313/docs/concepts/emit-state/index.md) — Publish structured state values from a device script so the dashboard, Home Assistant, and other watchers see them as entity updates.
- [Environment Variables](http://localhost:1313/docs/concepts/env-vars/index.md) — Store secrets and configuration outside your device script source code
- [Rate Limits](http://localhost:1313/docs/concepts/rate-limits/index.md) — API rate limits by plan tier and how to handle 429 responses
- [Script Versioning](http://localhost:1313/docs/concepts/versioning/index.md) — Understanding deployment versions and rollback
