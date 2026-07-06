# Plan 013: Design spike - multi-user project sharing (household model)

> **Executor instructions**: This is a DESIGN/SPIKE plan, not a build plan.
> The deliverable is a **written design report** - NOT merged production
> code. Do not modify any file outside `plans/`. Follow the steps in order,
> honor the STOP conditions, and when done update the status row for this
> plan in `plans/README.md` - unless a reviewer dispatched you and told you
> they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat bbd724d..HEAD -- apps/server/src/foundation/auth.ts apps/server/src/endpoints apps/server/migrations apps/server/src/runtime/devicesBridge.ts`
> Drift here does not stop the spike (it is an inventory exercise by nature),
> but note any drifted file in the report and inventory the live code, not
> this plan's excerpts.

## Status

- **Priority**: P3
- **Effort**: M (as a spike; the build it specifies is L)
- **Risk**: LOW (no production code is modified)
- **Depends on**: none. Coordination note: plan 003 (bundled MCP server with
  OAuth 2.1) introduces new token issuance; if 003 is DONE or IN PROGRESS,
  the report's token-scoping section must cover its tokens too.
- **Category**: direction
- **Planned at**: commit `bbd724d`, 2026-07-06

## Why this matters

DeviceSDK is a self-hosted home-automation platform, and homes contain more
than one person. The server already supports multiple accounts - the first
registered user is always allowed and `ALLOW_REGISTRATION` (default **true**,
`apps/server/src/config.ts:79`) admits more - but every resource is
hard-keyed to a single owner: the `projects` table has
`user_id TEXT NOT NULL` with `UNIQUE(user_id, project_id)`
(`apps/server/migrations/0002_add_projects_table.sql:6-10`), and roughly 24
endpoint files resolve access with a literal `user_id = ?1` condition. A
second household member who registers gets a permanently empty dashboard: no
way to see, control, or receive logs from any device in the house.

Retrofitting sharing touches the auth surface of every endpoint, the two
WebSocket paths, token semantics, and the blob-storage layout - too risky to
improvise. This spike produces the design that makes the eventual build plan
mechanical: a full inventory of ownership touchpoints, a chosen membership
model, and a phased migration.

## Current state (verified facts to start from)

- **Accounts**: local email/password auth
  (`apps/server/src/endpoints/auth/localAuth.ts`); first-run logic at lines
  43-48 (`registration_enabled: c.env.config.allowRegistration || count === 0`).
- **Auth precedence** (`apps/server/src/foundation/auth.ts`,
  `authenticateUser` at line 123): Bearer token → session cookie → `dsdk_`
  CLI token → API token hash. All four resolve to a single user; there is no
  role or membership concept anywhere.
- **Ownership pattern**: endpoints resolve project by
  `["user_id = ?1", "project_slug = ?2"]` then device by
  `["project_id = ?1", "device_slug = ?2"]` - exemplar
  `apps/server/src/endpoints/devices/getDeviceEntities.ts:54-82`.
  `grep -rln "user_id = ?1" apps/server/src/endpoints/` matched 24 files at
  the planned-at commit.
- **Schema**: `projects.user_id` FK → `user(id)` with
  `UNIQUE(user_id, project_id)` (migration 0002; 0007 only added
  name/description/updated_at columns). `tokens` (API tokens, migration
  0004) and `cli_tokens` (migration 0008) are user-scoped, not
  project-scoped.
- **Blob layout**: script bundles live at
  `DATA_DIR/scripts/{userId}/{projectSlug}/{deviceSlug}/{versionId}.js`
  (repo guide, `CLAUDE.md` "The server stores ALL state under DATA_DIR") -
  the **owner's userId is baked into the path**, which any sharing design
  must confront.
- **Runtime trust**: inter-device RPC is same-project
  (`apps/server/src/runtime/devicesBridge.ts` - "same-project trust model").
  Sessions are keyed `${projectId}:${deviceId}` with UUIDs
  (`apps/server/src/runtime/deviceHub.ts`).
- **WebSockets**: device + watcher WS routes in
  `apps/server/src/endpoints/devices/wsRoutes.ts`; how each authenticates is
  an inventory item (Step 1), not asserted here.
- **Dashboard**: Vue 3 + Quasar SPA; pages are
  `ProjectsPage.vue`, `ProjectDetailsPage.vue`, `DeviceDetailsPage.vue`,
  `TokensPage.vue`, `AccountPage.vue` (`apps/dashboard/src/pages/`).
- Repo rules that constrain the design: strict types, Zod at boundaries,
  sequential SQL migrations in `apps/server/migrations/`, response format
  `{ success, result | error }`, no em-dashes, files under ~700 LOC.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Server typecheck (read-only sanity while exploring) | `pnpm check-types --filter @devicesdk/server` | exit 0 |
| Server tests (baseline, before you start) | `pnpm test --filter @devicesdk/server` | all pass |
| Ownership-site inventory | `grep -rn "user_id = ?1" apps/server/src \| sort` | list of sites for Step 1 |

## Scope

**In scope** (the only files you may create or modify):

- `plans/013-report-multi-user-sharing.md` (create - the deliverable)
- `plans/README.md` (status row update at the end)

**Out of scope** (do NOT touch):

- ALL production code: `apps/`, `packages/`, `firmware/`, `migrations/`.
  This spike writes **zero** application code - no prototype branch, no
  draft migration files inside `apps/server/migrations/`. Proposed SQL and
  TypeScript appear only as fenced code blocks inside the report.
- No changeset (nothing shippable changes).

## Git workflow

- Create a dedicated worktree and branch:
  `git worktree add .worktrees/multi-user-sharing-spike -b multi-user-sharing-spike`
- Single commit style: `docs(plans): add multi-user sharing design report (plan 013)`.
- Run `pnpm lint` before committing.
- Open a PR into `main` with `gh pr create --base main` **only if** the
  `origin` remote is `github.com/device-sdk/devicesdk`; otherwise stop and
  ask the operator.

## Steps

### Step 1: Inventory every ownership touchpoint

Produce the report's Appendix A: a table of every place the current code
binds a resource to a single user. Cover at minimum:

1. Every `user_id = ?1` site in `apps/server/src/endpoints/` (expect ~24
   files) - for each: endpoint, HTTP method/path, resource, and whether the
   check is "resolve project by owner" or something else.
2. Both WebSocket routes in `wsRoutes.ts` - how the device WS and the
   watcher WS authenticate and what they check against (read the code; do
   not guess).
3. Token issuance and validation: `tokens`, `cli_tokens`, session cookies
   (`foundation/auth.ts`), CLI device-code flow (`endpoints/cli-auth/`).
4. The blob path construction (find where
   `scripts/{userId}/...` paths are built - start at
   `apps/server/src/storage/fsBlobStore.ts` and its callers).
5. The runtime: where `deviceHub`/`deviceSession`/`devicesBridge` assume a
   project (and therefore, transitively, one owner) - especially anything
   that would break if two users can send commands to the same device.
6. The dashboard: which pages/stores assume "my projects" (search
   `apps/dashboard/src/services/api.service.ts` and `stores/`).
7. `deleteUser.ts` (`endpoints/user/`) - what cascades today, and what must
   change when a user can own shared projects.

**Verify**: the inventory table's endpoint count matches
`grep -rln "user_id = ?1" apps/server/src/endpoints/ | wc -l` (± sites found
by reading, e.g. `d1Compat` call sites using different placeholder styles -
also grep `"user_id = ?"` and `user_id IN`).

### Step 2: Design the membership model

Write the report's core section. Requirements to satisfy:

- A `project_members` table (proposed SQL in the report), e.g.
  `(project_id, user_id, role, created_at)` with
  `PRIMARY KEY (project_id, user_id)`; the existing `projects.user_id`
  stays as the owner (simplest migration; evaluate and say so explicitly).
- **Roles**: propose exactly three - `owner` (everything, including member
  management and deletion), `operator` (send commands, deploy, edit env
  vars, watch), `viewer` (read + watch only). Map every endpoint from the
  Step 1 inventory to a minimum role in a table. If a two-role model
  (owner/member) is honestly sufficient for the household use case, say so
  and recommend it - fewer states is a feature.
- **The access helper**: specify one function, e.g.
  `resolveProjectAccess(c, projectSlug, minRole)` in
  `apps/server/src/foundation/`, that replaces the per-endpoint
  `user_id = ?1` project lookup, returns the project row or a 404/403
  result, and becomes the single choke point. Show its exact signature and
  its query (owner match OR membership row with sufficient role). Endpoints
  keep returning **404** (not 403) for projects the caller cannot see, to
  avoid slug-existence disclosure; justify or amend this in the report.
- **Blob paths**: decide between (a) keep `scripts/{ownerUserId}/...` and
  always resolve through the project's owner id (no data migration; sharing
  is metadata-only), or (b) re-key to `scripts/{projectId}/...` with a
  one-time file move in a migration. Recommend one; (a) is the
  low-risk default unless the inventory reveals a blocker.
- **Tokens and attribution**: API tokens and CLI tokens stay user-scoped;
  a member's token grants that member's role on shared projects. Decide how
  device logs / usage / commands are attributed (do they need a `user_id`
  stamp? today they do not have one). Cover plan 003's OAuth tokens if that
  plan has landed.
- **Invitation flow**: no email infrastructure exists and none should be
  added; propose owner-adds-member-by-email (the account must already
  exist) via `POST /v1/projects/:projectId/members`, plus list/remove. UI:
  a Members section on `ProjectDetailsPage.vue`.
- **What does NOT change**: device firmware, the device WS protocol, the
  script contract, inter-device RPC trust (same-project already implies
  shared-project once membership exists - state this explicitly and check
  `devicesBridge.ts` for user assumptions).

### Step 3: Phase the build and size it

Report section "Phased build plan": 3-5 phases, each independently
shippable and testable, e.g. (1) schema + access helper + read paths,
(2) write paths + role enforcement matrix + tests, (3) members CRUD API +
dashboard Members UI, (4) watcher WS + logs/metrics access, (5) docs +
`deleteUser` cascade rules. For each phase: files touched (from the Step 1
inventory), test strategy (which existing e2e files to extend - e.g.
`tests/e2e/projects.test.ts`, `tests/e2e/devices.test.ts` - and the new
`tests/e2e/project-members.test.ts`), and an S/M/L estimate. State the
total.

### Step 4: Open questions for the owner

End the report with a short list of decisions only the project owner can
make. Expected entries (refine from what you learned): two roles or three;
whether `ALLOW_REGISTRATION=true` should remain the default once sharing
exists (an open server on a LAN now hands new registrants a path to being
invited); whether shared projects appear merged in the projects list or
under a "Shared with me" section; whether attribution stamping (who sent a
command) is v1 or deferred.

### Step 5: Write the report and update the index

Assemble `plans/013-report-multi-user-sharing.md` with sections: Summary and
recommendation, Membership model (Step 2), Role/endpoint matrix, Blob-path
decision, Token semantics, Phased build plan (Step 3), Open questions
(Step 4), Appendix A: ownership inventory (Step 1). Then update the plan 013
row in `plans/README.md` to DONE.

**Verify**: report file exists; `pnpm lint` → exit 0;
`git status --porcelain` shows only the two in-scope files.

## Test plan

Not applicable in the usual sense - no production code changes. The spike's
"tests" are its verification gates: the Step 1 count cross-check and the
requirement that every endpoint in the inventory appears in the Step 2
role matrix (report is incomplete otherwise).

## Done criteria

ALL must hold:

- [ ] `plans/013-report-multi-user-sharing.md` exists with all eight sections
- [ ] Every endpoint file from the Step 1 grep appears in both Appendix A and
      the role matrix
- [ ] The report proposes concrete SQL for `project_members` and a concrete
      TypeScript signature for the access helper
- [ ] A blob-path recommendation is stated with its rationale
- [ ] `git status --porcelain` shows changes only under `plans/`
- [ ] `pnpm lint` exits 0
- [ ] `plans/README.md` status row for 013 updated

## STOP conditions

Stop and report back (do not improvise) if:

- You find an existing membership/role/sharing mechanism anywhere in the
  server (this plan asserts there is none; if one exists the premise is
  wrong).
- The ownership inventory exceeds ~60 distinct sites - the refactor cost
  assumption (M-per-phase) breaks and the owner should re-scope before you
  finish the design.
- `wsRoutes.ts` device authentication turns out to be coupled to the
  owner's identity in a way that firmware also depends on (would put
  firmware in the blast radius, which this plan assumes is untouched).
- You are tempted to write any file outside `plans/` - that is out of
  scope by definition.

## Maintenance notes

- The report goes stale as endpoints are added; each of plans 001-012 that
  adds server endpoints (notably 003 `/mcp`, 007 MQTT, 012 device-kv) adds
  rows to the ownership inventory. The eventual build plan must re-run the
  Step 1 grep, not trust Appendix A.
- If the owner approves the design, the follow-up is a numbered build plan
  (or one per phase) written against the then-current HEAD.
- The rejected-findings ledger in `plans/README.md` records that demand for
  sharing is **inferred from the domain**, not user-requested; if real
  users ask for it, that changes the priority from P3 upward.
