# Pricing

How DeviceSDK charges, and where each number lives. This file is the
human-readable description; the linked files are the machine sources of truth.

## Model

DeviceSDK is **usage-based, and the only metered unit is the WebSocket
message** — inbound (device → cloud) **and** outbound (cloud → device) combined.
Everything else is included at no cost:

- Device connections, registration, and uptime
- Cron-driven user-worker invocations
- Transfer bytes (only the message _count_ is metered, not its size)
- KV storage, logs, metrics, and dashboard access

So the usage dashboard records and shows all of those dimensions, but only the
message count contributes to the **estimated** spend.

## Tiers

| Tier | Price | Messages / device / day | Devices / project | Script versions / device | Env vars / project |
| ---- | ----- | ----------------------- | ----------------- | ------------------------ | ------------------ |
| Free | $0 | 500 | 5 | 5 | 50 |
| Pro  | Contact sales | 50,000 | 50 | 50 | 200 |

Free-tier devices are disconnected when they hit the daily message limit and
reconnect at midnight UTC. Pro-tier devices keep their connection and are
notified instead.

## Sources of truth

| What | Where |
| ---- | ----- |
| Customer-facing pricing page (tiers, copy, "what counts as a message") | `apps/website/layouts/pricing/pricing.html` — rendered at https://devicesdk.com/pricing. Note: `apps/website/content/pricing/_index.md` is intentionally empty; the layout hard-codes the content. |
| Enforced tier limits (the numbers the API actually gates on) | `apps/api/src/foundation/consts.ts` → `TIER_LIMITS` |
| **Metrics price** — the per-unit rate behind the dashboard's "estimated cost" | `apps/api/src/foundation/pricing.ts` → `PRICING` / `estimateCostUsd`. Surfaced to users by the metrics API (`apps/api/src/endpoints/metrics/`) and rendered in the dashboard (`apps/dashboard/src/components/metrics/`). |

When the public Pro per-message rate is finalized, update **both** the
customer-facing page (website layout) and the estimate rate
(`apps/api/src/foundation/pricing.ts`) so the dashboard estimate matches the
advertised price.

## "Estimated", not an invoice

The dashboard figures are reconstructed from **sampled** Analytics Engine data
(each aggregate is scaled by `_sample_interval`). They are good for trends and a
spend estimate, not exact-to-the-cent billing.
