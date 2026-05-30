---
"@devicesdk/api": minor
---

Record per-device usage metrics to a new `devicesdk_usage` Analytics Engine dataset (indexed by deviceId). The device Durable Object now emits inbound message, outbound command, cron-fire, and connection-duration data points (with byte counts) on the hot path via a new `recordDeviceUsage` helper. Writes are no-ops when the `USAGE` binding is absent and never throw into a request. This is the data-collection foundation for upcoming per-device / per-project dashboard metrics and estimated billing.
