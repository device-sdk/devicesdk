# Audit Batch 09 — Runtime Correctness

These items improve the reliability of the in-process device runtime.

## 1. Add a per-dispatch timeout to the FIFO promise chain

**File:** `apps/server/src/runtime/deviceSession.ts`

The per-session FIFO promise chain has no per-handler timeout. A user script handler that never resolves will stall all subsequent events for that device.

**Action:** Add a per-dispatch timeout (e.g., 30–60 s) with logging, so a stuck handler cannot freeze the device event queue.

---

## 2. Make `id` required in `DeviceMessageSchema`

**File:** `apps/server/src/runtime/deviceSession.ts`

`DeviceMessageSchema` defaults `id` to `""`. A malformed message without an `id` could incorrectly match a pending command with id `""`.

**Action:** Make `id` required in the schema or drop the default so missing ids do not resolve pending commands.

---

## 3. Address unbounded session growth in `deviceHub`

**File:** `apps/server/src/runtime/deviceHub.ts`

Sessions are created lazily and live for the process lifetime. There is no eviction/pruning; long-lived servers with many devices will grow memory unboundedly (though each session is small).

**Action:** Consider a session LRU/eviction policy for deployments with high device churn, or document the expected memory profile.

---

## 4. Fix `sendCommandWithoutAck` offline behavior

**File:** `apps/server/src/runtime/deviceSession.ts`

`sendCommandWithoutAck` throws immediately when the device is offline. This contradicts the user-facing `DeviceSenderInterface` JSDoc in `@devicesdk/core`, which says commands are queued for reconnect.

**Action:** Align the implementation with the documented contract, or update the JSDoc to match the actual behavior.
