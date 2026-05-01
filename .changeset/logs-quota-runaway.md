---
"@devicesdk/api": patch
"@devicesdk/cli": patch
"@devicesdk/dashboard": patch
"@devicesdk/website": patch
---

Logs-quota runaway fix + layered rate-limit defense:

- **@devicesdk/api (breaking)**: deprecate `GET /v1/projects/:projectId/devices/:deviceId/logs` — the endpoint now returns `410 Gone` with `Link: …/watch>; rel="alternate"` and `code: "LOGS_DEPRECATED"`. The corresponding DO RPC `BaseDevice.getLogs` throws on call. A stale CLI `--tail` polling loop in May 2026 burned the daily Durable Object rows-read free-tier quota in ~5 hours each day; the polling pattern is now structurally impossible.
- **@devicesdk/api**: watcher WebSocket (`/watch`) gains `?backfillLimit=N&backfillLevel=warn` query parameters. On connect the server emits up to N replay frames (`{ event: "log", data, replay: true }`, oldest-first) followed by a single `{ event: "history_complete" }` marker, then live broadcasts as before. One SQL scan per connection instead of per HTTP poll.
- **@devicesdk/api**: add `TieredCache` (`caches.default` L1 → KV L2 with back-fill) and a single `CACHE` KV namespace. Two consumers: `userBlockListMiddleware` (mounted post-auth — 429s blocked users at the edge of the worker without touching D1 or the DO) and `authCache.ts` (caches `authenticateUser` lookups for 60 s, dropping ~95% of D1 reads per request on active tokens). Logout / onboarding completion / account-deletion request all invalidate the entry.
- **@devicesdk/api**: when the per-user rate limit fires, also write a 1-hour cross-route block to `CACHE` so subsequent requests 429 immediately. Per-user rate limit is now scoped to `/logs` only (other routes are protected by tier limits inside their handlers and the WAF rule below).
- **@devicesdk/cli (breaking)**: `devicesdk logs` and `devicesdk logs --tail` now use the watcher WebSocket exclusively. Both modes accept `--lines` and `--level`; the polling loop is gone. `--tail` reconnects with exponential backoff (1 s → 30 s) and bails with a non-zero exit code after 5 consecutive failures.
- **@devicesdk/dashboard**: device logs panel migrates to WS-only. `useDeviceStream` accepts `{ backfillLimit, backfillLevel }` and exposes a `historyLoaded` ref; the panel shows a "Loading recent logs…" spinner until `history_complete` fires. The "Live" toggle and "Load More" button are removed — backfill + live are one stream.
- **@devicesdk/website**: documents the manual Cloudflare WAF rate-limit rule under `docs/operations/cloudflare-waf.md` and the new auth-cache / block-list architecture in CLAUDE.md.

**Manual deploy steps** (also in the PR description):

1. KV namespace IDs are already in `apps/api/wrangler.jsonc` (created in this branch).
2. Apply the WAF rule per `docs/operations/cloudflare-waf.md`.
