# Audit Batch 14 — Observability & Data Retention

These items improve operational visibility and cleanup behavior.

## 1. Add request/HTTP access logging

**File:** `apps/server/src/index.ts`

There is no request/HTTP access logging middleware. Server logs only errors and lifecycle events; operational visibility into request latency/status is missing.

**Action:** Add a lightweight Hono logging middleware (using `logger.ts`) that records method, path, status, and duration.

---

## 2. Add log-level control

**File:** `apps/server/src/foundation/logger.ts`

The logger has no log-level control; `debug`/`info`/`warn`/`error` are always emitted.

**Action:** Read a `LOG_LEVEL` env var in `loadConfig()` and skip levels below it.

---

## 3. Fix account-deletion data retention

**Files:**
- `apps/server/src/foundation/purgeUser.ts`
- `apps/server/migrations/0023_add_device_logs_table.sql`
- `apps/server/migrations/0024_add_device_kv_table.sql`
- `apps/server/migrations/0025_add_device_usage_table.sql`

Account deletion leaves orphaned `device_logs`, `device_kv`, and `device_usage` data because these tables do not have foreign-key constraints and are not purged.

**Action:** Either add `ON DELETE CASCADE` foreign keys or delete orphaned rows explicitly in `purgeUserData`.

---

## 4. Log swallowed errors in `usageMetrics`

**File:** `apps/server/src/foundation/usageMetrics.ts`

`usageMetrics` catches and discards every DB error. Metrics failures are intentionally best-effort, but at least a log line would aid debugging.

**Action:** Log swallowed errors at `warn` level.
