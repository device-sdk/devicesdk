# Audit Batch 07 — Critical & High Dependency Vulnerabilities

These are the highest-severity vulnerabilities from `pnpm audit` (55 advisories: 1 critical, 36 high, 16 moderate, 2 low).

## 1. Fix critical `happy-dom` RCE

**CVE:** CVE-2025-61927  
**Affected:** `vitest` → `happy-dom@15.11.7` in dashboard, simulation, CLI, and core  
**Action:** Add a pnpm override or update `vitest` to a version that depends on `happy-dom >=20.0.0`.

---

## 2. Fix `esbuild` binary integrity verification issue

**Affected:**
- `packages/cli > esbuild@0.25.12`
- `packages/cli > vitest/vite/tsx > esbuild@0.27.2/0.27.3`
- `apps/dashboard > @quasar/app-vite/vite > esbuild`
- `apps/simulation > vite > esbuild`

**Action:** Bump direct `esbuild` to `^0.28.1` (or latest). Update `vitest`, `vite`, and `tsx` to versions pulling patched `esbuild`.

---

## 3. Fix Vite dev-server arbitrary file read

**Affected:**
- `apps/dashboard > @quasar/app-vite > vite@7.3.1`
- `apps/simulation > vite@6.4.1`

**Action:** Update `vite` to patched versions (audit suggests `>=7.3.5` for 7.x and equivalent for 6.x).

---

## 4. Fix `serialize-javascript` RCE

**Affected:** `apps/dashboard > @quasar/app-vite > serialize-javascript@6.0.2`

**Action:** Update `serialize-javascript` to `>=7.0.5` via overrides or dependency updates.
