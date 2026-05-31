# Roadmap

Items captured from the May 2026 audit follow-up PR that were intentionally
deferred. Each item includes a one-line rationale and acceptance criteria so
a future agent or human can pick it up cold.

## Observability

### CloudFlare Analytics Engine metrics
**Why:** The API has no per-request latency or counter metrics. Operators
can't tell whether a regression is in command RPC, script init, or Worker
Loader rate-limit hits.
**Done when:** AE binding wired in `wrangler.jsonc`; counters emitted from
`device.ts` for command_latency_ms, worker_init_time_ms, loader_rate_limit_hits;
a Grafana / dashboards.cloudflare.com query proving the data is queryable.

### Coverage thresholds for dashboard and simulation
**Why:** Today both have coverage *measurement* but no enforcement. Adding
thresholds prevents silent regressions.
**Done when:** `apps/dashboard/tests/unit/vitest.config.ts` and
`apps/simulation/tests/vitest.config.ts` have `thresholds: { ... }` blocks set
~5pts below the first run's actual coverage, and CI fails when they're not met.

## Testing

### `packages/core` unit tests
**Why:** core ships to npm and downstream depends heavily on its types.
**Done when:** vitest config added; `expectTypeOf` tests cover the public
exports under `commands.ts`, `responses.ts`, `runtime.ts`; runtime tests cover
`asProjectId`, `asDeviceId`, etc.

### Pico firmware unit tests
**Why:** ESP32 has gtest + pytest in CI; Pico has only build verification.
**Done when:** firmware/pico has a host-runnable test harness mirroring
firmware/esp32, with at least one test for HAL pin mapping + WS protocol parse.

### CLI test coverage
**Why:** This PR added scaffolding + tests for `whoami` and `logout`. The
remaining commands (login, deploy, flash, dev, build, init, logs, inspect,
status, env, tokens) have only the existing co-located src/*.test.ts coverage.
**Done when:** each command in `packages/cli/src/commands/` has at least a
happy-path + one error-path test in `packages/cli/tests/`.

### Further `device.ts` slimming
**Why:** The May 2026 audit follow-up extracted `userEventQueue.ts` and
`logStreaming.ts` from `apps/api/src/durableObjects/lib/device.ts`, taking it
from 1633 → 1316 LOC. The file is still ~2x the 700 LOC CLAUDE.md ceiling.
The remaining bulk is `alarm()`, `webSocketMessage()`, `webSocketClose/Error`,
and Worker-Loader plumbing — these touch DO state heavily and don't extract
cleanly into pure-function modules.
**Done when:** device.ts is under 700 LOC, OR a written justification lives
inline explaining why further splits hurt readability/cohesion more than they
help (DO-specific reasoning, e.g. hibernation API constraints).

### Per-tab components for DeviceDetailsPage
**Why:** This PR extracted the ~300 LOC of inline script templates to
`apps/dashboard/src/lib/scriptTemplates.ts`, getting the page from 943 → 629
LOC (under the 700 ceiling). The audit also called for splitting each tab
panel into its own component.
**Done when:** `DeviceOverviewTab.vue`, `DeviceScriptTab.vue`,
`DeviceVersionsTab.vue`, `DeviceSettingsTab.vue` exist under
`apps/dashboard/src/components/device/`; the page passes props down + emits
events up; existing Playwright E2E suite still passes.

### Logger usage in remaining areas
**Why:** This PR replaced `console.*` with `logger` in API code. The CLI and
dashboard still use plain `console.error`. Consider whether either deserves a
similar abstraction (CLI: probably not, since it's a TTY tool; dashboard:
maybe worth it now that the error boundary is wired).
**Done when:** decision made and either wired up or explicitly closed out.

## CI / DX

### Consolidate `dashboard-tests.yml` into `ci.yml`
**Why:** Two workflows per PR makes branch protection rules harder to manage
and adds redundant install/cache steps. Merging would simplify both.
**Done when:** dashboard component + E2E jobs move into `.github/workflows/ci.yml`
(or kept separate but explicitly justified); `dashboard-tests.yml` deleted;
required-checks list in repo settings updated.

### PR preview deploys for dashboard + website
**Why:** Reviewers and design have no easy way to see UI changes without
checking out the branch.
**Done when:** PRs to `main` produce a comment with ephemeral Cloudflare Pages
URLs for dashboard and website; tear down on PR close.

### CONTRIBUTING.md
**Why:** Newcomers have to read CLAUDE.md (which is comprehensive but
agent-flavoured) to understand the workflow.
**Done when:** root `CONTRIBUTING.md` exists with: branch naming, commit
message style, changeset rules, lint/test commands, link into CLAUDE.md for
deep dives.

## Performance

### Quasar bundle audit
**Why:** Dashboard bundles the full Quasar framework. Tree-shaking should help
but hasn't been measured.
**Done when:** bundle analyser report in the PR; any unnecessary Quasar
components removed; either lighter UI primitives adopted for hot paths or a
written justification for keeping the full framework.

### Account deletion N+1
**Why:** `apps/api/src/scheduled.ts` `purgeUserData()` loops over projects
then devices then per-device children sequentially. Cron runs hourly on a
batch of 10 users so impact is bounded — but the structure is wrong.
**Done when:** `purgeUserData` collapses to a single
`DELETE … WHERE … IN (SELECT …)` per child table, plus one cascade-style
project/device delete; integration test that passes.

### TieredCache pre-warming for hot auth keys
**Why:** First request after a cold start hits L2 (KV). Hot user sessions
could be pre-warmed.
**Done when:** decision made on whether the latency win is worth the
complexity (probably not for most sessions); if yes, implementation +
benchmark.

## Security

### Token migration deadline
**Why:** `apps/api/src/foundation/auth.ts` still has a fallback path for
un-migrated cleartext tokens. Read-time migration runs whenever an old token
is used, but until the column is dropped, the code path persists.
**Done when:** deadline announced; cleartext-token fallback removed; column
dropped in a migration; row count of legacy tokens before deletion logged for
visibility.

## Firmware

### ESP32

#### WebSocket frame reassembly
**Why:** The WS handler ignores `payload_len`/`payload_offset`, so server→device
frames larger than the 2048-byte `buffer_size` (e.g. large `display_update`/`env`
blobs) are split across events and dropped.
**Done when:** the handler reassembles multi-event frames up to a sane cap, and
the fix is verified on real ESP32 hardware with an oversized `display_update`/`env`
payload.

### Pico

Deferred (out of scope, parity with ESP32):

- `command_ack`/`command_error` payload uses `command` rather than the contract's
  `command_type` (server resolves by id, so harmless today; ESP32 also uses
  `command`).
- `set_pin_config` is unhandled (returns "Unknown command type") — needs real
  interval/analog-reporting work on Core 1, not just a field rename.
