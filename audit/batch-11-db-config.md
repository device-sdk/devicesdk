# Audit Batch 11 — Database Layer & Configuration

These items improve SQLite reliability and configuration correctness.

## 1. Standardize DB surface usage

**Finding:** The codebase uses two DB surfaces interchangeably: `c.get("qb")` (workers-qb) and `c.env.DB.prepare(...)` (D1 compat). This creates inconsistency and makes refactors/error handling harder.

**Action:** Standardize on `c.get("qb")` for endpoint queries; reserve `c.env.DB` for legacy/cloud-era call sites that still need migration.

---

## 2. Improve SQLite pragmas

**File:** `apps/server/src/server.ts`

SQLite is opened with `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`, but there is no `busy_timeout` or explicit checkpoint management.

**Action:** Add `PRAGMA busy_timeout` and consider a periodic `PRAGMA wal_checkpoint(TRUNCATE)` in the janitor for long-running servers.

---

## 3. Tighten `parseBool` validation

**File:** `apps/server/src/config.ts`

`parseBool` returns `true` for any value other than `"0"`, `"false"`, `"no"`, or `"off"`. A typo like `MDNS_ENABLED=flase` or `SECURE_COOKIES=off` (case-sensitive check is only on lowercased list) silently enables the feature.

**Action:** Tighten `parseBool` to accept only a whitelist of truthy strings (`1`, `true`, `yes`, `on`) and throw/log on unrecognized values.

---

## 4. Validate `PORT`

**File:** `apps/server/src/config.ts`

`Number.parseInt(env.PORT || "8080", 10)` does not validate for `NaN`. A non-numeric `PORT` would produce `NaN` and likely crash `Bun.serve`.

**Action:** Validate `PORT` and fail fast with a clear error message if it is not a positive integer.
