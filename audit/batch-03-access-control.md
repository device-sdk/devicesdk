# Audit Batch 03 — Access Control & WebSocket Security

These items tighten the trust boundary between users, devices, and the network.

## 1. Introduce device-scoped credentials

**Files:**
- `apps/server/src/endpoints/devices/wsRoutes.ts`
- `apps/server/src/foundation/auth.ts`
- `firmware/esp32/main/devicesdk_main.c`
- `firmware/pico/main.cpp`

Device WebSocket authentication currently uses a user-scoped API token. Any valid token for the user can connect as any of that user’s devices and can call any REST endpoint (download firmware, read env vars, send commands, etc.). A single compromised device equals full account compromise.

**Action:** Design a `device_tokens` table / credential type that permits only `connect/websocket` and a narrow command surface. Rotate those independently of user API tokens and update firmware clients.

---

## 2. Validate WebSocket `Origin` on upgrade

**Files:** `apps/server/src/endpoints/devices/wsRoutes.ts`, `apps/server/src/ws.ts`

Device and watcher WebSocket routes do not validate the `Origin` / `Sec-WebSocket-Origin` header. An attacker who obtains a valid token can open a device or watcher WebSocket cross-origin from a browser.

**Action:** Enforce origin checks in the WS upgrade handler: allow same-origin plus any explicitly configured dashboard origins; reject cross-origin upgrades that do not match.

---

## 3. Add general API rate limiting

**Files:** `apps/server/src/index.ts`, `src/foundation/rateLimit.ts`

Only `/v1/auth/*` and CLI auth routes are rate-limited. Authenticated endpoints outside of auth are unrate-limited. `authenticateUser` SHA-256-hashes the presented token on every request, which is fast enough that a token-guessing attack against a leaked token space is not meaningfully slowed.

**Action:** Add a sliding-window rate limiter for authenticated API use, keyed by user/token, with configurable limits.

---

## 4. Restrict localhost CORS to local environments

**File:** `apps/server/src/index.ts`

The CORS middleware allows `localhost` origins with credentials unconditionally, even in production. This enables a malicious page served at `localhost:9000`/`localhost:9002` to make credentialed cross-origin requests.

**Action:** Only enable the localhost CORS config when `ENV === "local"`. In production, serve the dashboard same-origin and disable CORS (or restrict to an explicit allow-list).
