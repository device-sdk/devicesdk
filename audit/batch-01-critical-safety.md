# Audit Batch 01 — Critical Safety & Correctness

These items affect data integrity, process stability, or user-visible correctness and should be addressed first.

## 1. Fix `D1CompatDatabase.batch` transaction atomicity

**File:** `apps/server/src/db/d1Compat.ts`

The `batch()` method currently passes an **async callback** to `db.transaction(...)`. Bun/better-sqlite3 transactions are synchronous and commit when the callback returns its initial Promise, **before the awaited statements run**. This silently breaks atomicity for any caller relying on `c.env.DB.batch()` (e.g., entity upserts, env-var sets, CLI token refresh).

**Action:** Rewrite `D1CompatDatabase.batch` with a synchronous `db.transaction(() => { ... })` callback.

---

## 2. Add a `/health` (or `/ready`) endpoint

**Files:** `apps/server/src/index.ts`, `docs/public/resources/troubleshooting.md`

The troubleshooting docs tell users to run `curl /health`, but the server does not expose this route. It returns 404, which makes operators think the server is down. There is also no readiness/liveness probe for Docker / Kubernetes.

**Action:** Add a lightweight `GET /health` route returning `{success:true,result:{status:"ok"}}`. Optionally add `/ready` that confirms SQLite is writable. Update the troubleshooting doc to match.

---

## 3. Fix device socket replacement behavior

**File:** `apps/server/src/runtime/deviceSession.ts`

When a new device connection replaces a stale one, the stale socket is closed but its `onClose` is then ignored by the `ws !== this.deviceWs` guard. Pending commands on the old socket are not rejected until their 5-second timeout expires, and `connectedSeconds` usage for the replaced session is not recorded.

**Action:** In `handleDeviceOpen`, before replacing `this.deviceWs`, explicitly reject pending commands and record usage for the outgoing socket.

---

## 4. Add process-level crash protection

**File:** `apps/server/src/server.ts`

The Bun server registers only `SIGTERM`/`SIGINT`. If a floating promise rejects (e.g., a DB write or async mDNS callback not awaited), the process may crash or emit an unhandled rejection without diagnostics.

**Action:** Add handlers for `unhandledRejection` (log) and `uncaughtException` (log + `process.exit(1)`).
