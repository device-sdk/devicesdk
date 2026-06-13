# Audit Batch 10 — Cloud-Era Cleanup & Runtime Convergence

These items remove misleading legacy terminology and align the CLI simulator with the production server runtime.

## 1. Begin CLI dev-engine convergence

**Files:** `packages/cli/src/simulator/*`, `packages/cli/src/commands/dev.ts`

`devicesdk dev` still runs a `workerd`-based simulator with Durable Objects. This directly contradicts the roadmap’s “CLI dev-engine convergence” goal and means local dev semantics differ from the production Bun runtime.

**Action:** Extract `packages/device-engine` from `apps/server/src/runtime` so `devicesdk dev` can run the same in-process runtime as the server. This is a larger refactor; create a dedicated design issue/PR.

---

## 2. Replace misleading Cloudflare terminology in comments

**Files:** Multiple under `apps/server/src/`

Code and comments still refer to Durable Objects, D1, and R2 even though the implementation is in-process/filesystem. The binding names (`SCRIPTS`, `FIRMWARES`, `DEVICE`, `DB`) are intentionally preserved, but inline comments like “Dispatch the command to the Durable Object via RPC” and “Best-effort R2 cleanup” are misleading.

**Action:** Audit server source and replace misleading comments with self-host terminology (e.g., “device session”, “script store”, “SQLite DB”).

---

## 3. Fix stale comment in `listLogs.ts`

**File:** `apps/server/src/endpoints/logs/listLogs.ts`

A comment references `BaseDevice.getLogs` in `durableObjects/lib/device.ts`, which no longer exists in this tree.

**Action:** Update the comment to reference the current runtime path.

---

## 4. Update `baseRoute.ts` comment

**File:** `apps/server/src/foundation/baseRoute.ts`

A comment explains `handleError` in terms of the Cloudflare Workers bundler creating multiple Zod instances. The duck-typing is harmless, but the rationale is no longer relevant for Bun.

**Action:** Update the comment to describe the current self-host context.
