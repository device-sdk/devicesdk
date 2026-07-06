# Plan 012: Device KV inspector - REST list/delete endpoints + dashboard Storage tab

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat bbd724d..HEAD -- apps/server/src/endpoints/devices apps/server/src/runtime/deviceSession.ts apps/server/src/types.d.ts apps/dashboard/src/pages/DeviceDetailsPage.vue apps/dashboard/src/services/api.service.ts`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `bbd724d`, 2026-07-06

## Why this matters

User device scripts persist state through `DEVICE.kv` (get/put/delete), and
the docs actively teach the pattern (`docs/public/recipes/persist-counter-kv.md`).
But nothing in the product can *read* that state back for a human: no REST
endpoint, no dashboard view, no CLI command touches the `device_kv` table.
Today, debugging persisted state means opening `sqlite3` against
`DATA_DIR/devicesdk.sqlite` inside the container. This plan closes the
write-without-read asymmetry: a list endpoint, a delete endpoint, and a
"Storage" tab on the device details page.

Scope is deliberately read + delete only. Editing values from the dashboard is
deferred (see Maintenance notes) because a hand-edited value can violate type
assumptions in the running script.

## Current state

### Server

- `apps/server/migrations/0024_add_device_kv_table.sql` - the table:

  ```sql
  CREATE TABLE IF NOT EXISTS device_kv (
      device_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (device_id, key)
  );
  ```

  Values are JSON-encoded strings (`JSON.stringify`). `device_id` is the
  device's UUID (`devices.id`), not the slug.

- `apps/server/src/runtime/deviceSession.ts:42-43` - the reserved prefix:

  ```ts
  // Prefix reserved for internal keys; blocked from the user-facing kv API.
  const INTERNAL_KEY_PREFIX = "__internal:";
  ```

  The runtime stores cron scheduler state under `__internal:cron_schedules`
  (`CRON_STORAGE_KEY`, line 40). **Deleting that key from outside would
  corrupt scheduler state**, so both new endpoints must exclude/reject
  `__internal:`-prefixed keys.

- `apps/server/src/runtime/deviceSession.ts:584-636` - `kvGet`/`kvPut`/
  `kvDelete` read and write SQLite directly on every call (no in-memory
  cache). Consequence: a REST delete is immediately visible to the running
  script's next `kv.get`, and no cache invalidation is needed. There is no
  `kvList` in the script-facing API; the endpoints query the table directly.

- `apps/server/src/endpoints/devices/getDeviceEntities.ts` - the exemplar
  endpoint to copy. The ownership-resolution chain (project by
  `user_id + project_slug`, then device by `project_id + device_slug`, 404 on
  either miss) is at lines 48-82:

  ```ts
  const project = await qb
      .fetchOne<tableProjects>({
          tableName: "projects",
          where: {
              conditions: ["user_id = ?1", "project_slug = ?2"],
              params: [user.id, projectId],
          },
      })
      .execute()
      .then((p) => p.results);
  if (!project) {
      return c.json({ success: false, error: "Project not found" }, 404);
  }
  // ...same shape for device by ["project_id = ?1", "device_slug = ?2"]...
  ```

  Match this file's structure exactly: Chanfana `BaseRoute` subclass, `schema`
  with `tags`/`summary`/`operationId`/Zod `request`/`responses`, response body
  `{ success: true, result: ... }`.

- `apps/server/src/endpoints/devices/router.ts` - route registration:

  ```ts
  devicesRouter.get("/:deviceId/entities", GetDeviceEntities);
  devicesRouter.put("/:deviceId/entities", UpsertDeviceEntities);
  ```

  The router is mounted at `/v1/projects/:projectId/devices`
  (`apps/server/src/index.ts:177`).

- `apps/server/src/types.d.ts` - table row types live here (e.g.
  `tableDevices` at line 66, `tableDeviceEntityConfigs` at line 107). There is
  no `tableDeviceKv` yet; add one.

- Test harness exemplar: `apps/server/tests/e2e/device-entities.test.ts` -
  `TestServer.start()` + `srv.scaffold({ projectSlug, deviceSlug })` +
  `srv.get/put/delete(path, { token })`. Model the new test file on it.

### Dashboard

- `apps/dashboard/src/pages/DeviceDetailsPage.vue:57-62` - the tab bar:

  ```html
  <q-tab name="overview" label="Overview" icon="info" />
  <q-tab name="metrics" label="Metrics" icon="bar_chart" />
  <q-tab name="script" label="Script" icon="code" />
  <q-tab name="versions" label="Versions" icon="history" />
  <q-tab name="logs" label="Logs" icon="article" />
  <q-tab name="settings" label="Settings" icon="settings" />
  ```

  The Versions tab is the exemplar for a lazy-loaded table tab: a `q-table`
  panel (lines 200-260), a cached loader
  (`versionsCached`/`fetchVersions(force)` around lines 552-561), a tab-change
  hook that triggers the load (around line 691), and a confirm dialog pattern
  (`showRollbackDialog`, lines 392-417) reusable for delete confirmation.

- `apps/dashboard/src/services/api.service.ts` - services are plain object
  literals (`deviceService` at line 310, `scriptService` at line 407) using
  the shared `api.call` wrapper. Exemplar method (lines 436-444):

  ```ts
  async getVersions(projectId: string, deviceId: string): Promise<ScriptVersion[]> {
    const data = await api.call<ApiResponse<ScriptVersion[]>>(
      `/v1/projects/${projectId}/devices/${deviceId}/script/versions`
    );
    if (!data || !data.success) {
      throw new Error('Failed to fetch script versions');
    }
    return data.result;
  },
  ```

### Conventions that apply

- Strict types: no `any`; `unknown` + narrowing.
- Validate at boundaries with Zod (Chanfana does this via `schema.request`).
- Response format `{ "success": true, "result": ... }` /
  `{ "success": false, "error": "..." }`.
- IDs `crypto.randomUUID()`, timestamps `Date.now()` (not needed here, listed
  for completeness).
- No em-dashes anywhere in code, comments, or docs.
- Bun-specific APIs stay in `apps/server`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Server typecheck | `pnpm check-types --filter @devicesdk/server` | exit 0 |
| Server tests | `pnpm test --filter @devicesdk/server` | all pass |
| Dashboard unit tests | `pnpm test:unit --filter @devicesdk/dashboard` | all pass |
| Lint (run before every commit) | `pnpm lint` | exit 0 |
| Regen OpenAPI | `cd apps/server && bun run scripts/generate-openapi.ts` | `openapi.json` updated, exit 0 |
| Changeset | `pnpm changeset` | interactive; or write the file by hand (see Step 7) |

## Scope

**In scope** (the only files you should modify or create):

- `apps/server/src/endpoints/devices/listDeviceKv.ts` (create)
- `apps/server/src/endpoints/devices/deleteDeviceKv.ts` (create)
- `apps/server/src/endpoints/devices/router.ts` (register the two routes)
- `apps/server/src/types.d.ts` (add `tableDeviceKv`)
- `apps/server/openapi.json` (regenerated, not hand-edited)
- `apps/server/tests/e2e/device-kv.test.ts` (create)
- `apps/dashboard/src/services/api.service.ts` (add kv methods to `deviceService`)
- `apps/dashboard/src/pages/DeviceDetailsPage.vue` (add Storage tab)
- `apps/dashboard/src/lib/formatKvValue.ts` (create - pure helper)
- `apps/dashboard/tests/unit/formatKvValue.spec.ts` (create)
- `.changeset/<any-slug>.md` (create)

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/src/runtime/deviceSession.ts` - the script-facing kv API is
  untouched; you only read it for reference.
- Any `PUT`/write endpoint for kv values - explicitly deferred.
- `packages/cli` - no CLI command in this plan.
- `docs/public/` - docs can follow in a later pass; the OpenAPI regen already
  documents the endpoints.
- Migrations - the `device_kv` table already exists; no schema change.

## Git workflow

- Create a dedicated worktree and branch (repo rule - never work in the main
  checkout, never commit to `main`):
  `git worktree add .worktrees/device-kv-inspector -b device-kv-inspector`
- Conventional commit style, e.g.
  `feat(server): add device KV list/delete endpoints` and
  `feat(dashboard): add device Storage tab`.
- Run `pnpm lint` before every commit.
- Open a PR into `main` with `gh pr create --base main` **only if** the
  `origin` remote is `github.com/device-sdk/devicesdk`; otherwise stop and ask
  the operator.

## Steps

### Step 1: Add the `tableDeviceKv` row type

In `apps/server/src/types.d.ts`, next to the other table types (e.g.
`tableDeviceEntityConfigs`), add:

```ts
export type tableDeviceKv = {
	device_id: string;
	key: string;
	value: string | null;
	updated_at: number;
};
```

**Verify**: `pnpm check-types --filter @devicesdk/server` → exit 0.

### Step 2: Create the list endpoint

Create `apps/server/src/endpoints/devices/listDeviceKv.ts`, copying the
structure of `getDeviceEntities.ts` (imports, `BaseRoute` subclass, ownership
chain). Specifics:

- `operationId: "devices-list-kv"`, `summary: "List a device's persisted KV entries"`,
  `tags: ["Devices"]`.
- Params schema identical to `getDeviceEntities.ts`
  (`projectId`/`deviceId`, `z.string().min(1).max(36)`).
- After resolving the device, query with the query builder:

  ```ts
  const { results: rows } = await qb
      .fetchAll<tableDeviceKv>({
          tableName: "device_kv",
          where: {
              conditions: ["device_id = ?1", "key NOT LIKE '__internal:%'"],
              params: [device.id],
          },
      })
      .execute();
  ```

- Response `result` shape:

  ```ts
  { entries: Array<{ key: string; value: string | null; updated_at: number }> }
  ```

  `value` is the raw stored TEXT (a JSON-encoded string). Do **not**
  `JSON.parse` it server-side; the dashboard decides how to render it. Sort
  entries by `key` ascending in JS after fetching (workers-qb `orderBy` may be
  used instead if the existing endpoints use it; match whatever
  `listVersions.ts` does).

**Verify**: `pnpm check-types --filter @devicesdk/server` → exit 0.

### Step 3: Create the delete endpoint

Create `apps/server/src/endpoints/devices/deleteDeviceKv.ts`, same skeleton.
Specifics:

- `operationId: "devices-delete-kv"`, `summary: "Delete a persisted KV entry from a device"`.
- The key arrives as a **query parameter**, not a path segment (user keys may
  contain `/`, `:` or spaces): request schema adds
  `query: z.object({ key: z.string().min(1).max(512) })`.
- Reject reserved keys **before** touching the DB: if
  `key.startsWith("__internal:")`, return
  `c.json({ success: false, error: "Reserved key" }, 400)`. This protects
  `__internal:cron_schedules` (scheduler state).
- Delete is idempotent, mirroring `deviceSession.kvDelete` (lines 598-608):
  select first to learn whether the row existed, then delete, then return
  `{ success: true, result: { deleted: boolean } }` with status 200 either
  way. Use `c.env.DB.prepare(...).bind(...).run()` or the qb `delete` API -
  match whichever pattern `deleteEnvVar.ts` uses (open it and copy its
  delete-statement style).

**Verify**: `pnpm check-types --filter @devicesdk/server` → exit 0.

### Step 4: Register routes and regenerate OpenAPI

In `apps/server/src/endpoints/devices/router.ts` add:

```ts
devicesRouter.get("/:deviceId/kv", ListDeviceKv);
devicesRouter.delete("/:deviceId/kv", DeleteDeviceKv);
```

Then regenerate the OpenAPI document:
`cd apps/server && bun run scripts/generate-openapi.ts`

**Verify**: `git diff --stat apps/server/openapi.json` shows changes, and
`grep -c "devices-list-kv\|devices-delete-kv" apps/server/openapi.json` → `2`
(or more, if referenced multiple times; must be >= 2... use
`grep -o` and count both operationIds appear at least once each).

### Step 5: Server e2e tests

Create `apps/server/tests/e2e/device-kv.test.ts` modeled on
`tests/e2e/device-entities.test.ts` (same `TestServer` +
`srv.scaffold` boilerplate). Seed rows by inserting directly through the test
server's DB handle if the harness exposes one; if it does not, seed via the
runtime path is not available over REST (no write endpoint), so check the
harness (`tests/harness.ts`) for a direct SQLite handle (`srv.db` or similar)
and insert:

```sql
INSERT INTO device_kv (device_id, key, value, updated_at) VALUES (?, ?, ?, ?)
```

(The device UUID for the scaffolded device must be looked up by slug; the
harness scaffold result or a `GET /v1/projects/:p/devices/:d` call gives it.)

Cases to cover (see Test plan for the full list): list empty, list returns
seeded user keys but never `__internal:` keys, delete existing key
(`deleted: true`), delete missing key (`deleted: false`, 200), delete
`__internal:` key → 400 and the row is still present, both endpoints 404 on a
project/device the auth user does not own, both endpoints 401 without a token.

**Verify**: `pnpm test --filter @devicesdk/server` → all pass, including the
new file.

### Step 6: Dashboard - service methods, formatter, Storage tab

1. In `apps/dashboard/src/services/api.service.ts`, add to `deviceService`:
   - `async getKvEntries(projectId, deviceId): Promise<KvEntry[]>` calling
     `GET /v1/projects/${projectId}/devices/${deviceId}/kv`;
   - `async deleteKvEntry(projectId, deviceId, key): Promise<boolean>` calling
     `DELETE .../kv?key=${encodeURIComponent(key)}` and returning
     `result.deleted`.
   Define `KvEntry = { key: string; value: string | null; updated_at: number }`
   wherever the file keeps its response types (search for `ScriptVersion` and
   put it alongside). Follow the exact error-handling shape of `getVersions`.
2. Create `apps/dashboard/src/lib/formatKvValue.ts`: a pure function
   `formatKvValue(raw: string | null): string` that returns `"null"` for
   null, pretty-printed JSON (`JSON.stringify(JSON.parse(raw), null, 2)`) when
   `raw` parses, and the raw string otherwise. Check `apps/dashboard/src/lib/`
   first for where helpers live and match the local export style.
3. In `DeviceDetailsPage.vue`:
   - Add `<q-tab name="storage" label="Storage" icon="storage" />` after the
     Versions tab.
   - Add a `q-tab-panel name="storage"` with a `q-table` (columns: Key, Value,
     Updated) copying the Versions panel's structure, including its
     empty-state block ("No stored keys yet"). Render values through
     `formatKvValue`, truncated in the cell (CSS ellipsis or `.slice`) with
     the full value in an expand row or tooltip - match however the Versions
     table shows long IDs.
   - Per-row delete button opening a confirm dialog copied from the rollback
     dialog pattern (lines 392-417); on confirm call `deleteKvEntry`, then
     refresh the list.
   - Lazy-load with a cached flag exactly like `versionsCached` /
     `fetchVersions` and the tab-change hook near line 691.

**Verify**: `pnpm check-types --filter @devicesdk/dashboard` → exit 0 (if that
turbo task does not exist for the dashboard, `pnpm build --filter
@devicesdk/dashboard` → exit 0), and `pnpm lint` → exit 0.

### Step 7: Dashboard unit test + changeset

1. Create `apps/dashboard/tests/unit/formatKvValue.spec.ts` modeled on
   `tests/unit/metricsFormat.spec.ts`: null input, valid JSON object, plain
   non-JSON string, JSON scalar (`"42"`).
2. Create a changeset file, e.g. `.changeset/device-kv-inspector.md`:

   ```markdown
   ---
   "@devicesdk/server": minor
   "@devicesdk/dashboard": minor
   ---

   Device KV inspector: REST endpoints to list and delete a device's
   persisted `DEVICE.kv` entries, and a Storage tab on the dashboard device
   page. Internal (`__internal:`) keys are hidden and protected.
   ```

**Verify**: `pnpm test:unit --filter @devicesdk/dashboard` → all pass;
`pnpm lint` → exit 0.

## Test plan

New server tests in `apps/server/tests/e2e/device-kv.test.ts` (pattern:
`tests/e2e/device-entities.test.ts`):

1. `GET .../kv` with no rows → 200, `entries: []`.
2. Seed `counter` + `__internal:cron_schedules` → list returns only
   `counter`, with raw JSON string value and numeric `updated_at`.
3. `DELETE .../kv?key=counter` → 200 `{ deleted: true }`; second call →
   `{ deleted: false }`.
4. `DELETE .../kv?key=__internal:cron_schedules` → 400; row still present
   (re-check via direct DB read).
5. Unauthenticated requests to both endpoints → 401.
6. Requests against a project slug owned by a different user → 404 (scaffold
   a second user if the harness supports it; if it does not, a nonexistent
   project slug returning 404 is the acceptable fallback - note which you did).

New dashboard test `apps/dashboard/tests/unit/formatKvValue.spec.ts` (pattern:
`tests/unit/metricsFormat.spec.ts`): 4 cases listed in Step 7.

Verification: `pnpm test --filter @devicesdk/server` and
`pnpm test:unit --filter @devicesdk/dashboard` → all pass.

## Done criteria

ALL must hold:

- [ ] `pnpm check-types --filter @devicesdk/server` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test --filter @devicesdk/server` exits 0 and includes the new
      `device-kv` tests
- [ ] `pnpm test:unit --filter @devicesdk/dashboard` exits 0 and includes
      `formatKvValue.spec.ts`
- [ ] `grep -n "devices-list-kv" apps/server/openapi.json` and
      `grep -n "devices-delete-kv" apps/server/openapi.json` both match
- [ ] `grep -rn "__internal" apps/server/src/endpoints/devices/listDeviceKv.ts apps/server/src/endpoints/devices/deleteDeviceKv.ts` shows the prefix is filtered in list and rejected in delete
- [ ] A changeset exists naming `@devicesdk/server` and `@devicesdk/dashboard`
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 012 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `device_kv` schema differs from the excerpt in "Current state" (a
  migration after 0026 may have altered it).
- `deviceSession.ts` no longer reads/writes SQLite directly per kv operation
  (i.e. an in-memory cache appeared) - the "REST delete is immediately
  coherent" assumption would be false and the delete endpoint needs a
  session-invalidation design instead.
- The test harness (`tests/harness.ts`) exposes no way to seed `device_kv`
  rows (no DB handle) - do not add a write endpoint to work around it.
- `DeviceDetailsPage.vue` no longer has the tab structure shown above
  (plan 001 or another plan may have restructured it).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Deferred: value editing (PUT)**. If added later, it must re-validate that
  the running script tolerates type changes, and must keep rejecting the
  `__internal:` prefix. The delete endpoint's query-param pattern is the one
  to copy.
- **Deferred: CLI surface** (`devicesdk kv list/delete`). The REST endpoints
  are deliberately CLI-shaped (query-param key) so this is additive.
- Plan 011 (device-engine extraction) inventories `apps/server/src/runtime/`;
  these endpoints read the `device_kv` table directly and are unaffected, but
  reviewers of that extraction should keep the `__internal:` prefix contract
  in one shared constant if the runtime moves.
- Reviewer focus: the `__internal:` filtering in both endpoints (list SQL
  `NOT LIKE` + delete 400), and that `value` is passed through raw rather
  than parsed server-side.
