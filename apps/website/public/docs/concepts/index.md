---
title: "Concepts"
description: "Understand how DeviceSDK works"
---

# Concepts

> Understand how DeviceSDK works


Foundational concepts you'll meet across the CLI, dashboard, and SDK:

- [Platform Architecture](/docs/concepts/architecture/): how the runtime, devices, and dashboard fit together
- [Project & Device Identifiers](/docs/concepts/identifiers/): what `projectId` and the device key in `devicesdk.ts` mean
- [Entrypoints](/docs/concepts/entrypoints/): the `DeviceEntrypoint` class and lifecycle methods
- [Versioning](/docs/concepts/versioning/): how deployed scripts are versioned and rolled back
- [Environment Variables](/docs/concepts/env-vars/): project-scoped secrets via `this.env.VARS`
- [Cron Scheduling](/docs/concepts/cron-scheduling/): declaring scheduled handlers
- [`emitState`](/docs/concepts/emit-state/): publishing structured telemetry to watchers
- [Rate Limits](/docs/concepts/rate-limits/): brute-force auth protection on the server
