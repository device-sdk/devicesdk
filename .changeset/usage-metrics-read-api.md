---
"@devicesdk/api": minor
---

Add read endpoints for per-device and per-project usage metrics, backed by the `devicesdk_usage` Analytics Engine dataset via Cloudflare's Analytics Engine SQL API:

- `GET /v1/projects/:projectId/devices/:deviceId/metrics?window=1h|12h|7d` — time-bucketed messages in/out, bytes, cron fires, connection seconds, and estimated cost for one device.
- `GET /v1/projects/:projectId/metrics?window=1h|12h|7d` — one usage series per device, project-wide totals, and a 30-day daily *estimated* spend chart.

Adds a `pricing.ts` source of truth for cost estimation and a `metricsClient.ts` that builds the AE SQL queries (sampling-aware via `_sample_interval`), guards interpolated identifiers, and degrades gracefully to empty result sets when the `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` credentials are absent (reusing the existing deploy token; needs Account Analytics: Read).

Pricing follows the platform model documented in the new root `pricing.md`: **only WebSocket messages (in + out) are metered** — connections, uptime, cron invocations, transfer bytes, storage, logs, and metrics are free, so only the message rate is non-zero. The per-message rate is a placeholder until public Pro pricing is set. All numbers are sampled estimates, not exact billing.
