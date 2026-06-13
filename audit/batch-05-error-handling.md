# Audit Batch 05 — Error Handling & Type Safety

These items improve runtime reliability and remove unsafe casts.

## 1. Replace unsafe `err as Error` casts

**Files:**
- `apps/server/src/runtime/deviceSession.ts:163`
- `apps/server/src/runtime/deviceSession.ts:276`
- `apps/server/src/foundation/deviceReboot.ts:28`
- `apps/server/src/janitor.ts:27`
- `apps/server/src/endpoints/devices/sendCommand.ts:111`

Several catch blocks cast `unknown` to `Error` directly. If a non-Error value is thrown, this can produce misleading error messages or runtime errors.

**Action:** Add a small `getErrorMessage(err)` helper that checks `instanceof Error` / `typeof`, and use it throughout the server.

---

## 2. Type the WebSocket route context correctly

**File:** `apps/server/src/endpoints/devices/wsRoutes.ts`

The WS route context is cast through `unknown` (`c as unknown as AppContext`), and custom keys are stashed with `as never`. This bypasses Hono’s type safety.

**Action:** Extend Hono’s `Variables` type in `apps/server/src/types.d.ts` with `wsConnect`/`wsWatch` and remove the `never` casts.

---

## 3. Validate device responses in `sendCommand`

**File:** `apps/server/src/endpoints/devices/sendCommand.ts`

`sendCommand` parses and casts the device body without schema validation. If a malicious or compromised device returns an unexpected shape, the API may return malformed data.

**Action:** Validate device responses with the `DeviceResponse` schema from `@devicesdk/core`.

---

## 4. Distinguish client vs. server errors in `downloadFirmware`

**File:** `apps/server/src/endpoints/devices/downloadFirmware.ts`

The catch block collapses all patch failures to HTTP 400, including internal/firmware-blob problems that should be 500s.

**Action:** Distinguish client validation errors (already thrown as `ApiException`) from unexpected internal failures, returning 500 for the latter.
