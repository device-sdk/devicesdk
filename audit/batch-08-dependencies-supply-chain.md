# Audit Batch 08 — Supply Chain & Dependency Automation

These items reduce long-term supply-chain risk and keep dependencies current.

## 1. Add automated dependency update tooling

**Finding:** No Renovate, Dependabot, or other automated dependency update tooling is configured. `.github/dependabot.yml` and `renovate.json*` are absent.

**Action:** Add Renovate or Dependabot with an `AGPL-3.0-only` license allow-list and ignore-list for build-only copyleft deps if desired.

---

## 2. Pin Docker base images by digest

**File:** `Dockerfile`

`oven/bun:1.3.14` / `oven/bun:1.3.14-slim` / `node:22-slim` are referenced by mutable tag. Tags can be mutated, propagating supply-chain compromise.

**Action:** Pin images to SHA256 digests and enable Renovate/Dependabot for digest updates.

---

## 3. Verify/update `spawndamnit` license

**Finding:** `spawndamnit@3.0.1` has an Unknown license field. It is a transitive dev dependency (likely of `@changesets/cli`).

**Action:** Verify the license upstream or replace with a clearly-licensed alternative.

---

## 4. Review `chanfana` patch file

**Finding:** `chanfana` is pinned to `3.3.0` and patched via `patches/chanfana@3.3.0.patch` (safeParseAsync fix).

**Action:** Ensure the patch file is reviewed in code review and upgraded as soon as upstream releases a fix.
