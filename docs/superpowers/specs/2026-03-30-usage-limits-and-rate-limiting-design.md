# Usage Limits & Rate Limiting Design

**Date**: 2026-03-30
**Status**: Draft
**Goal**: Prevent abuse by gating all platform functionality behind tier-based limits and per-user API rate limiting.

## Context

The platform currently has almost no usage limits. Only 3 CLI auth endpoints have IP-based rate limits, and a few resources have hardcoded caps (50 API tokens, 50 env vars). There are no limits on projects, devices, script versions, firmware downloads, or WebSocket messages. This leaves the platform vulnerable to abuse.

Two tiers will be introduced: **Free** (default for all users) and **Paid** (admin-set). No billing integration -- admins upgrade users manually via D1 console. The website will be updated to show actual limits with a beta disclaimer.

## Tier Limits

| Resource | Free | Paid |
|----------|------|------|
| Projects per user | 3 | 30 |
| Devices per project | 5 | 50 |
| Script versions per device | 5 | 50 |
| API tokens per user | 5 | 50 |
| Messages per device per day | 500 | 50,000 |
| Env vars per project | 50 | 200 |
| API rate limit (req/min) | 60 | 120 |

## Architecture

### 1. Plan Field on User Table

New D1 migration adds `plan TEXT NOT NULL DEFAULT 'free'` to the `user` table. The `plan` field is loaded into `c.get("user")` through all auth paths (session, CLI token, API token).

**Migration**: `apps/api/migrations/0016_add_plan_to_user.sql`

### 2. Tier Limits Config

Central `TIER_LIMITS` constant in `apps/api/src/foundation/consts.ts`. Single source of truth for all limit values. Type-safe with `UserPlan` type.

### 3. Resource Limit Enforcement

Each creation endpoint checks the current count against `TIER_LIMITS[plan]` before inserting. A shared helper `enforceResourceLimit()` in `apps/api/src/foundation/limits.ts` standardizes the error response.

**Endpoints with limit checks:**
- `createProject.ts` -- projects per user
- `createDevice.ts` -- devices per project
- `uploadScript.ts` -- script versions per device
- `batchUpload.ts` -- devices per project + script versions per device
- `createApiToken.ts` -- API tokens per user (update from hardcoded 50)
- `setEnvVars.ts` -- env vars per project (update from hardcoded 50)

**Error format**: HTTP 403
```json
{
  "success": false,
  "error": "Free tier limit reached (3/3 projects). Upgrade to increase your limit or contact support@devicesdk.com."
}
```

### 4. Per-User API Rate Limiting

New `userRateLimitMiddleware()` in `apps/api/src/foundation/rateLimit.ts`. Keyed on `user:{userId}` (not IP). Reads plan from `c.get("user")` to determine limits. Returns 429 with `Retry-After` header.

Mounted in `apps/api/src/index.ts` as `app.use("*", userRateLimitMiddleware())` immediately after `authenticateUser`. This covers all authenticated endpoints. The existing IP-based rate limits on CLI auth endpoints remain unchanged.

Uses the existing `rate_limits` D1 table (same cleanup pattern).

### 5. Per-Device Message Counting (Durable Object)

Message counting happens in `apps/api/src/durableObjects/lib/device.ts`:
- In-memory counter `_messageCountToday` with date tracking `_messageCountDate` (YYYY-MM-DD UTC)
- Resets at midnight UTC when date changes
- Flushed to DO storage every 50 messages (survives hibernation)
- Restored from storage on hibernation wake
- User plan passed as URL query param during device connect

**Counted**: Every `webSocketMessage` call (inbound device messages). Outbound commands from the API are not counted (they go through `sendCommandAndWaitForResponse`/`sendCommandWithoutAck`, which are API-initiated, not device-initiated).

**When limit hit (free tier)**: The device is disconnected and blocked until the next UTC day:
1. Send a `rate_limit` JSON message with `retry_after` (seconds until midnight UTC):
   ```json
   {"type": "rate_limit", "payload": {"error": "Daily message limit reached", "retry_after": 3600}}
   ```
2. Close WebSocket with custom code **4029** and reason `"Daily message limit reached"`
3. Log to device_logs: `"Connection closed: daily message limit reached (500/500). Retry after {retry_after}s."`
4. Persist exhausted state to DO storage so subsequent connection attempts are also refused

**When limit hit (paid tier)**: The `rate_limit` message is sent but the connection stays open. Messages are dropped silently until the next UTC day.

**Connection refusal (free tier)**: On new WebSocket connection attempts (`handleWebSocketUpgrade`), if the stored message count for today's date is already at or above the limit:
1. Accept the WebSocket briefly (firmware can't easily parse HTTP error responses)
2. Immediately send the `rate_limit` message with `retry_after`
3. Close with code 4029
4. Log to device_logs: `"Connection refused: daily message limit reached. Retry after {retry_after}s."`
5. Return (don't initialize user worker or store deviceMeta)

### 5a. Firmware Changes for Rate Limit Handling

Both firmware implementations need modifications to support variable reconnection delays.

**Custom close code 4029**: Application-specific code (4000-4999 range) meaning "rate limited."

**Pico firmware** (`firmware/pico/`):
- `lib/lwip_ws/ws_client.cpp` (`parse_frame` method): Parse the close frame payload to extract the 2-byte close code. Store code in a field accessible to `main.cpp`.
- `lib/lwip_ws/ws_client.h`: Add `uint16_t last_close_code` and `uint32_t rate_limit_retry_after` fields.
- Message handler: When a `rate_limit` type message is received, parse `retry_after` from payload and store it.
- `main.cpp` (reconnection logic at line 396): If `last_close_code == 4029` and `rate_limit_retry_after > 0`, wait `rate_limit_retry_after * 1000` ms instead of the default 5000ms. Reset `last_close_code` after using it.

**ESP32 firmware** (`firmware/esp32/`):
- `main/iotkit_main.c`: In the `WEBSOCKET_EVENT_DATA` handler, detect `rate_limit` message type and store `retry_after`.
- In the `WEBSOCKET_EVENT_DISCONNECTED` handler: If `rate_limit_retry_after > 0`, call `vTaskDelay(retry_after * 1000 / portTICK_PERIOD_MS)` before the library auto-reconnects. Alternatively, stop the client and restart after the delay.
- Parse close code from disconnect event data if available via ESP-IDF API.

**Logging**: Both firmwares should log (via serial/UART) when rate-limited: `"Rate limited: waiting {retry_after}s before reconnecting."`

### 6. User Details Enrichment

`/v1/user/me` response extended with:
- `plan`: current tier
- `limits`: the tier's max values (for UI display)
- `usage`: current project count and API token count

### 7. Website Updates

`apps/website/layouts/pricing/pricing.html`:
- Free tier: show actual limits (3 projects, 5 devices/project, etc.)
- Paid tier: show 10x limits
- Beta banner: "Limits are lower during beta. Need more? Email us at support@devicesdk.com."

## Auth Path Changes

The `plan` field must be available in `c.get("user")` for all three auth methods:

1. **Session auth** (line 115-129 in auth.ts): Uses `fields: "u.*"` -- automatically includes `plan` after migration.
2. **CLI token auth** (line 67-82): Raw SQL SELECT that explicitly lists columns -- must add `u.plan`.
3. **API token auth** (line 137-150): Uses `fields: "u.*"` -- automatically includes `plan`.

`c.set("user", ...)` call on line 103 (CLI token path) must include `plan`.

## Known Limitations

- **D1 race conditions**: Two concurrent create requests could both pass the count check. Accepted tradeoff (same as existing env var race condition). Worst case: one extra resource beyond limit.
- **Message count accuracy**: In-memory counter flushed every 50 messages. After hibernation wake, count may be stale by up to 50 messages. Acceptable for a soft daily cap.
- **No per-endpoint rate tuning**: All authenticated endpoints share the same rate limit. Could be refined later.

## Files Modified

| File | Change |
|------|--------|
| `apps/api/migrations/0016_add_plan_to_user.sql` | New migration |
| `apps/api/src/types.d.ts` | Add `plan` to `tableUser` |
| `apps/api/src/foundation/consts.ts` | `UserPlan` type + `TIER_LIMITS` config |
| `apps/api/src/foundation/limits.ts` | New: `enforceResourceLimit()` helper |
| `apps/api/src/foundation/rateLimit.ts` | Add `userRateLimitMiddleware()` |
| `apps/api/src/foundation/auth.ts` | Add `u.plan` to CLI token SELECT |
| `apps/api/src/index.ts` | Mount user rate limit middleware |
| `apps/api/src/endpoints/projects/createProject.ts` | Project count check |
| `apps/api/src/endpoints/devices/createDevice.ts` | Device count check |
| `apps/api/src/endpoints/scripts/uploadScript.ts` | Version count check |
| `apps/api/src/endpoints/scripts/batchUpload.ts` | Device + version checks |
| `apps/api/src/endpoints/tokens/createApiToken.ts` | Update token limit |
| `apps/api/src/endpoints/env-vars/setEnvVars.ts` | Update env var limit |
| `apps/api/src/endpoints/user/userDetails.ts` | Plan/limits/usage in response |
| `apps/api/src/durableObjects/lib/device.ts` | Message counting |
| `apps/api/src/endpoints/devices/deviceConnect.ts` | Pass plan to DO |
| `firmware/pico/lib/lwip_ws/ws_client.cpp` | Parse close code, store rate_limit retry_after |
| `firmware/pico/lib/lwip_ws/ws_client.h` | Add close code and retry fields |
| `firmware/pico/main.cpp` | Variable reconnect delay based on rate limit |
| `firmware/esp32/main/iotkit_main.c` | Handle rate_limit message, variable reconnect delay |
| `apps/website/layouts/pricing/pricing.html` | Update pricing display |
| `apps/dashboard/src/services/api.service.ts` | Update User type |
| Test files | Limit enforcement tests |

## Verification

1. Run `cd apps/api && npx wrangler d1 migrations apply DB --local` to apply migration
2. Run `pnpm test --filter @devicesdk/api` -- all existing tests pass (users default to free)
3. New tests verify: free user creating 4th project gets 403, paid user can create 30, rate limit returns 429 at 61st req/min
4. `pnpm check-types --filter @devicesdk/api` passes
5. `pnpm lint --filter @devicesdk/api` passes
6. Website: `pnpm dev --filter @devicesdk/website` shows updated pricing page
