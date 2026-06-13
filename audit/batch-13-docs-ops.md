# Audit Batch 13 — Documentation & Operational Ergonomics

These items fix stale docs and improve day-to-day operations.

## 1. Clean up Cloudflare-era `TROUBLESHOOT.md`

**Files:** `TROUBLESHOOT.md`, `AGENTS.md`

`TROUBLESHOOT.md` contains ~16 stale `apps/api/...` paths and Cloudflare/Durable-Object instructions that no longer apply to the self-hosted Bun server. `AGENTS.md` tells agents to consult it first.

**Action:** Add a prominent header to `TROUBLESHOOT.md` noting that pre-2026-06 entries describe the old Cloudflare stack. Migrate still-relevant self-host notes to a new section and remove or archive obsolete ones.

---

## 2. Remove stale `CLAUDE.md` references

**Files:**
- `docs/public/cli/init.md`
- `docs/public/changelog.md`
- `firmware/pico/README.md`
- `firmware/esp32/README.md`
- `docs/public/hardware/esp32-c61.md`
- `apps/website/README.md`
- `apps/website/static/_redirects`

Multiple docs still say `devicesdk init` scaffolds `CLAUDE.md` or link to `CLAUDE.md`. The canonical file is now `AGENTS.md` and the CLI only writes `AGENTS.md`.

**Action:** Replace all `CLAUDE.md` references with `AGENTS.md` or the correct docs link.

---

## 3. Fix AGENTS.md logger path

**File:** `AGENTS.md`

`AGENTS.md` points to `apps/server/src/logger.ts`; the real file is `apps/server/src/foundation/logger.ts`.

**Action:** Correct the path in `AGENTS.md`.

---

## 4. Improve `pnpm local` dev ergonomics

**File:** root `package.json`

`pnpm local` uses shell backgrounding (`&`), so failures in one process are hidden, ports may race, and there is no clean shutdown.

**Action:** Replace with a proper concurrent runner (e.g., `concurrently` or a Turbo `local` pipeline). At minimum, document that it backgrounds processes.
