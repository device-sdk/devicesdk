# Plan 014: Persist entity state - last-known values, history, watch backfill, dashboard charts, and CLI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e6d6454..HEAD -- apps/server/src/runtime/ apps/server/src/endpoints/devices/ apps/server/migrations/ apps/server/src/foundation/consts.ts apps/server/src/janitor.ts apps/dashboard/src/ packages/cli/src/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the device-session hot path and the watch protocol)
- **Depends on**: none. Synergy: plan 001 (Home Assistant integration) consumes
  the watcher `state` replay this plan adds; landing 014 before 001 executes
  gives HA last-known state on reconnect for free.
- **Category**: direction
- **Planned at**: commit `e6d6454`, 2026-07-06

## Why this matters

`DEVICE.emitState(entityId, value)` is the user-facing way a device script
publishes sensor readings, but today the server only broadcasts the value to
watcher WebSockets that happen to be open at that instant - nothing is stored.
A temperature sensor emitting readings all day produces data nobody can ever
see. There is no last-known value (a dashboard or Home Assistant client that
connects sees nothing until the next emission), no history, no charts, and no
CLI surface - `devicesdk logs` explicitly ignores `state` frames
(`packages/cli/src/commands/logs.ts:237`). This plan persists entity state into
SQLite with retention, replays last-known values to newly attached watchers,
exposes latest + history over REST (history keyed by state name), adds a State
tab with charts to the dashboard, and a `devicesdk state` CLI command (latest
values, per-entity history, live tail).

## Current state

Relevant files, each with its role:

- `apps/server/src/runtime/deviceSession.ts` - per-device session. `emitState`
  (lines 672-678) broadcasts and drops the value; `attachWatcher` (lines
  607-653) sends a `status` frame then an optional log backfill; `logStream`
  field is initialized at line 127.
- `apps/server/src/runtime/logStore.ts` - the pattern to mirror:
  `broadcastToWatchers` (22-36), `persistAndBroadcastLog` (102-141, including
  throttled cleanup), `fetchRecentLogs` (148-170). Also contains
  `broadcastStateFromMessage` (50-95) which emits `state` frames for raw
  hardware messages - **leave that function untouched** (see scope).
- `apps/server/src/foundation/consts.ts` - log limit constants
  (`LOG_RETENTION_MS`, `LOG_MAX_STORED`, `LOG_CLEANUP_INTERVAL = 100`,
  `LOG_CLEANUP_MIN_INTERVAL_MS = 6h`). New state constants go beside them.
- `apps/server/src/janitor.ts` - hourly retention pruning; add one DELETE.
- `apps/server/migrations/` - sequential SQL files; latest is
  `0031_add_firmware_info_to_devices.sql` (0028-0030 are unused numbers), so
  the new one is `0032_...` (if taken when you start, use the next free number
  everywhere).
- `apps/server/src/types.d.ts` - table row types (`tableDevices` at line 66).
- `apps/server/src/endpoints/devices/getDeviceEntities.ts` - the endpoint
  pattern to copy (Chanfana `BaseRoute`, `c.get("qb")`, project→device
  ownership resolution, `{ success, result }` response shape).
- `apps/server/src/endpoints/devices/router.ts` - route registration:
  `devicesRouter.get("/:deviceId/entities", GetDeviceEntities);` etc.
- `apps/dashboard/src/composables/useDeviceStream.ts` - watcher WS composable.
  Line 116: `// event === 'state' is reserved for future UI features` - this
  plan implements that.
- `apps/dashboard/src/lib/api.ts` - fetch wrapper (`call<T>`, cookie auth).
- `apps/dashboard/src/services/api.service.ts` - service layer; `logService.
  getWatchUrl` at line 505; metrics types (`MetricsWindow = '1h'|'12h'|'7d'`)
  at line 527.
- `apps/dashboard/src/components/metrics/MetricsChart.vue` - reusable echarts
  wrapper (`v-chart` + loading/empty/error overlays). Reuse it for state
  charts; do not add a new chart library.
- `apps/dashboard/src/pages/DeviceDetailsPage.vue` - tab strip at lines 57-62
  (`overview`, `metrics`, `script`, `versions`, `logs`, `settings`).
- `packages/cli/src/api/logs.ts` - `getWatchUrl` watcher-WS URL builder
  (19-38); the new `states.ts` API module sits beside it.
- `packages/cli/src/api/entities.ts` - `request()` HTTP helper pattern to copy
  for the state endpoints.
- `packages/cli/src/commands/logs.ts` - the only watcher-WS consumer today;
  line 237 explicitly ignores `state` frames (stays unchanged).
- `packages/cli/src/commands/status.ts` - table-output and project/device
  resolution idiom to copy for the new `state` command.
- `packages/cli/src/index.ts` - command registration; `status` block at
  245-262, `logs` block at 171-208.
- `packages/cli/src/simulator/localDeviceSender.ts:295-297` - `emitState` is a
  no-op in the local dev simulator (out of scope - the CLI `state` command
  targets a deployed server).

Key excerpts (verify these against live code before editing):

`deviceSession.ts:672-678`:
```ts
emitState(entityId: string, value: unknown): void {
	broadcastToWatchers(this.watchers, "state", {
		entity_id: entityId,
		value,
		source: "user",
	});
}
```

`deviceSession.ts:127`:
```ts
private logStream: LogStreamState = { logWriteCount: 0, lastLogCleanupAt: 0 };
```

`logStore.ts` overflow-cleanup SQL inside `persistAndBroadcastLog` (mirror
this shape for state):
```ts
db.query(
	"DELETE FROM device_logs WHERE device_id = ?1 AND created_at < ?2",
).run(deviceId, now - LOG_RETENTION_MS);
db.query(
	`DELETE FROM device_logs WHERE device_id = ?1 AND id NOT IN (
		SELECT id FROM device_logs WHERE device_id = ?1 ORDER BY created_at DESC LIMIT ?2
	)`,
).run(deviceId, LOG_MAX_STORED);
```

Watch protocol (documented in AGENTS.md, consumed by dashboard + CLI + future
HA integration): frames are `{event: "log"|"status"|"state"|"history_complete",
data, replay?}`. Adding `replay: true` state frames on watcher attach is
additive and consistent with the documented `replay?` field. The CLI already
tolerates state frames (it ignores them today; the new `state` command
consumes them, replayed and live).

Repo conventions that apply:

- Strict types, no `any`; validate all external input with Zod.
- IDs via `crypto.randomUUID()`, timestamps `Date.now()` (epoch ms).
- Response shape `{ "success": true, "result": ... }`.
- No em-dashes anywhere (use " - ").
- Never run migration SQL through workers-qb Query objects (TROUBLESHOOT.md);
  the migration runner `src/db/migrate.ts` handles `migrations/*.sql`.
- Files under ~700 LOC.

## Commands you will need

| Purpose | Command (run from repo root unless noted) | Expected on success |
|---------|-------------------------------------------|---------------------|
| Install | `pnpm install` | exit 0 |
| Server typecheck | `pnpm check-types --filter @devicesdk/server` | exit 0 |
| Server lint | `pnpm lint --filter @devicesdk/server` | exit 0 |
| Server tests | `pnpm test --filter @devicesdk/server` | all pass |
| CLI typecheck | `pnpm check-types --filter @devicesdk/cli` | exit 0 |
| CLI tests (incl. state command) | `pnpm test --filter @devicesdk/cli` | all pass |
| Dashboard unit tests | `pnpm test:unit --filter @devicesdk/dashboard` | all pass |
| Full build | `pnpm build` | exit 0 |
| Regenerate OpenAPI | `cd apps/server && bun run scripts/generate-openapi.ts` | openapi.json updated, exit 0 |
| Changeset | `pnpm changeset` | interactive; see step 13 |
| Root lint (pre-commit) | `pnpm lint` | exit 0 |

## Scope

**In scope** (the only files you should modify or create):

- `apps/server/migrations/0032_add_device_entity_states.sql` (create)
- `apps/server/src/types.d.ts` (add two table types)
- `apps/server/src/foundation/consts.ts` (add STATE_* constants)
- `apps/server/src/runtime/stateStore.ts` (create)
- `apps/server/src/runtime/deviceSession.ts` (wire stateStore in)
- `apps/server/src/janitor.ts` (one DELETE)
- `apps/server/src/endpoints/devices/getDeviceState.ts` (create)
- `apps/server/src/endpoints/devices/getDeviceStateHistory.ts` (create)
- `apps/server/src/endpoints/devices/router.ts` (register routes)
- `apps/server/openapi.json` (regenerated, not hand-edited)
- `apps/server/tests/e2e/device-state.test.ts` (create)
- `apps/server/tests/unit/state-store.test.ts` (create)
- `apps/dashboard/src/services/api.service.ts` (add stateService)
- `apps/dashboard/src/composables/useDeviceStream.ts` (handle state frames)
- `apps/dashboard/src/lib/stateFrames.ts` (create - pure helper, testable)
- `apps/dashboard/src/components/DeviceStatePanel.vue` (create)
- `apps/dashboard/src/pages/DeviceDetailsPage.vue` (add State tab)
- `apps/dashboard/tests/unit/stateFrames.spec.ts` (create)
- `packages/cli/src/api/states.ts` (create - HTTP helpers for the two endpoints)
- `packages/cli/src/commands/state.ts` (create - `devicesdk state` command)
- `packages/cli/src/commands/state.test.ts` (create)
- `packages/cli/src/index.ts` (register the `state` command)
- `apps/docs/src/content/docs/cli/state.md` (create)
- `AGENTS.md` (one-line watch-protocol doc update; CLAUDE.md is a symlink to
  it - edit AGENTS.md only)
- `.changeset/*.md` (three new changesets)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):

- `logStore.ts` `broadcastStateFromMessage` - hardware-message state frames
  (`gpio_state_changed`, `pin_state_update`, `temperature_result`) stay
  ephemeral in v1. GPIO edges can be very chatty; persisting them is a
  deliberate non-goal. Only user `emitState` persists.
- `packages/core` - the `emitState` contract and types are unchanged.
- `packages/cli/src/commands/logs.ts` - its `state`-frame ignore comment (line
  237) stays; the CLI's state surface is the new dedicated `state` command.
- `packages/cli/src/simulator/` - `devicesdk dev` has no watchers to notify
  (`localDeviceSender.ts:295-297`); the `state` command targets a deployed
  server. Surfacing simulator-emitted states is a recorded follow-up, not
  scope.
- `apps/server/src/endpoints/logs/` - the log-only paging endpoint is
  unrelated to entity state; do not extend it to cover entity history or
  model the new history endpoint on it.
- Firmware directories, `apps/website`, `apps/simulation`.
- Any change to the shape of existing watch frames (`log`, `status`,
  `history_complete`) or existing REST responses.

## Git workflow

- Work in a dedicated worktree off `main` (repo rule - never work in the main
  checkout): `git worktree add .worktrees/014-entity-state-history -b 014-entity-state-history`
- Conventional commits, e.g. `feat(server): persist entity state with history and watch backfill`
  and `feat(dashboard): device State tab with entity charts`.
- Run `pnpm lint` before every commit.
- Open a PR into `main` only if `origin` points at
  `github.com/device-sdk/devicesdk`; otherwise report and ask (repo rule).

## Steps

### Step 1: Migration

Create `apps/server/migrations/0032_add_device_entity_states.sql`:

```sql
-- Migration number: 0032    2026-07-06
-- Entity state persistence: history rows (janitor-pruned) plus a last-known
-- value per (device, entity) that survives retention so quiet sensors still
-- have a value to show.
CREATE TABLE IF NOT EXISTS device_entity_states (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    value TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entity_states_device_entity_created
    ON device_entity_states(device_id, entity_id, created_at);

CREATE TABLE IF NOT EXISTS device_entity_state_latest (
    device_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    value TEXT NOT NULL,
    source TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (device_id, entity_id)
);
```

`value` is the JSON-encoded emitted value (`JSON.stringify(value ?? null)`).

**Verify**: `pnpm test --filter @devicesdk/server` → all pass (the test
harness runs `applyMigrations`, so a broken migration fails loudly).

### Step 2: Table types and constants

In `apps/server/src/types.d.ts`, next to the existing table types, add:

```ts
export type tableDeviceEntityStates = {
	id: string;
	device_id: string;
	entity_id: string;
	value: string;
	source: string;
	created_at: number;
};

export type tableDeviceEntityStateLatest = {
	device_id: string;
	entity_id: string;
	value: string;
	source: string;
	updated_at: number;
};
```

In `apps/server/src/foundation/consts.ts`, below the log constants, add:

```ts
// Entity state persistence limits (mirrors the device_logs approach).
export const STATE_VALUE_MAX_LENGTH = 4_096; // JSON-encoded; larger values broadcast but do not persist
export const STATE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const STATE_MAX_STORED = 10_000; // per device, across all entities
export const STATE_MIN_PERSIST_INTERVAL_MS = 1_000; // per entity write coalescing
export const STATE_CLEANUP_INTERVAL = 100;
export const STATE_CLEANUP_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
```

**Verify**: `pnpm check-types --filter @devicesdk/server` → exit 0.

### Step 3: `stateStore.ts`

Create `apps/server/src/runtime/stateStore.ts` mirroring `logStore.ts`
(imports `Database` from `bun:sqlite`, constants from `../foundation/consts`,
`broadcastToWatchers` from `./logStore`, `RuntimeSocket` from `./types`):

```ts
export interface StateStreamState {
	stateWriteCount: number;
	lastStateCleanupAt: number;
	lastPersistAtByEntity: Map<string, number>;
}
```

`persistAndBroadcastState(db, deviceId, watchers, state, entityId, value, source)`:

1. `const json = JSON.stringify(value ?? null);` and `const now = Date.now();`
2. Always broadcast first (existing wire shape, unchanged):
   `broadcastToWatchers(watchers, "state", { entity_id: entityId, value, source })`
3. If `json.length > STATE_VALUE_MAX_LENGTH` → return (broadcast-only).
4. Upsert the latest table (same `ON CONFLICT` idiom as `internalKvPut` in
   `deviceSession.ts:622-630`):
   `INSERT INTO device_entity_state_latest (device_id, entity_id, value, source, updated_at) VALUES (?1,?2,?3,?4,?5) ON CONFLICT (device_id, entity_id) DO UPDATE SET value = ?3, source = ?4, updated_at = ?5`
5. Coalesce history writes per entity: if
   `now - (state.lastPersistAtByEntity.get(entityId) ?? 0) < STATE_MIN_PERSIST_INTERVAL_MS`
   → return. Otherwise insert a history row
   (`id = crypto.randomUUID()`), set `state.lastPersistAtByEntity.set(entityId, now)`,
   increment `state.stateWriteCount`.
6. Throttled cleanup, exactly the `persistAndBroadcastLog` shape: when
   `state.stateWriteCount % STATE_CLEANUP_INTERVAL === 0` and
   `now - state.lastStateCleanupAt > STATE_CLEANUP_MIN_INTERVAL_MS`, run the
   retention DELETE (`created_at < now - STATE_RETENTION_MS`) and the
   per-device overflow DELETE (`id NOT IN (SELECT id ... ORDER BY created_at
   DESC LIMIT STATE_MAX_STORED)`) against `device_entity_states`.

`fetchLatestStates(db, deviceId)` → all rows from `device_entity_state_latest`
for the device, ordered by `entity_id`.

`fetchStateHistory(db, deviceId, entityId, opts: { from?: number; to?: number; limit: number })`
→ rows from `device_entity_states` for that device+entity, `created_at`
between from/to when given, **ascending** `created_at`, `LIMIT` clamped to
[1, 2000]. When only `limit` is given, return the most recent N but still in
ascending order (subquery: select newest N descending, then order ascending).

**Verify**: `pnpm check-types --filter @devicesdk/server` → exit 0.

### Step 4: Wire into `deviceSession.ts`

- Add a field next to `logStream` (line 127):
  `private stateStream: StateStreamState = { stateWriteCount: 0, lastStateCleanupAt: 0, lastPersistAtByEntity: new Map() };`
- Replace the body of `emitState` (672-678) with a call to
  `persistAndBroadcastState(this.deps.db, this.deviceId, this.watchers, this.stateStream, entityId, value, "user")`.
- In `attachWatcher`, after the initial `status` send (line 613-622's try/catch)
  and **before** the log backfill block, replay last-known states:

```ts
// Last-known entity state replay - bounded by the device's entity count.
try {
	for (const row of fetchLatestStates(this.deps.db, this.deviceId)) {
		let value: unknown;
		try {
			value = JSON.parse(row.value);
		} catch {
			continue;
		}
		ws.send(
			JSON.stringify({
				event: "state",
				data: { entity_id: row.entity_id, value, source: row.source },
				replay: true,
			}),
		);
	}
} catch (error) {
	this.deps.logger.error(error, "Watcher state replay failed");
}
```

Do not change the `history_complete` semantics: it still fires only when a
log backfill was requested.

**Verify**: `pnpm test --filter @devicesdk/server` → all pass (in particular
`tests/e2e/runtime-device.test.ts` still passes - it exercises watcher
attach).

### Step 5: Janitor

In `apps/server/src/janitor.ts`, add after the `device_usage` DELETE:

```ts
qb.db
	.query("DELETE FROM device_entity_states WHERE created_at < ?1")
	.run(now - STATE_RETENTION_MS);
```

Import `STATE_RETENTION_MS` from `./foundation/consts`. Do NOT prune
`device_entity_state_latest` (last-known values survive retention by design).

**Verify**: `pnpm check-types --filter @devicesdk/server` → exit 0.

### Step 6: REST endpoints

Model both on `getDeviceEntities.ts` (same ownership resolution: project by
`user_id + project_slug`, then device by `project_id + device_slug`; 404s with
`{ success: false, error }`).

`apps/server/src/endpoints/devices/getDeviceState.ts` - class
`GetDeviceState`, `GET /:deviceId/state`, operationId `devices-get-state`,
tag `Devices`. Response 200:
`{ success: true, result: { states: [{ entity_id, value, source, updated_at }] } }`
where `value` is `JSON.parse`d (skip rows that fail to parse, like
`getDeviceEntities` skips bad rows). Reads via `qb.fetchAll<tableDeviceEntityStateLatest>`
or `fetchLatestStates` on `c.env.DB`'s underlying db - prefer the qb pattern
used by `getDeviceEntities`.

`apps/server/src/endpoints/devices/getDeviceStateHistory.ts` - class
`GetDeviceStateHistory`, `GET /:deviceId/state/history`, operationId
`devices-get-state-history`. Query schema:

```ts
query: z.object({
	entityId: z.string().min(1).max(128),
	from: z.coerce.number().int().nonnegative().optional(),
	to: z.coerce.number().int().nonnegative().optional(),
	limit: z.coerce.number().int().min(1).max(2000).optional(),
}),
```

Default `limit` 500. Response 200:
`{ success: true, result: { states: [{ entity_id, value, source, created_at }] } }`
ascending by `created_at` (chart-ready). Query `device_entity_states` with the
device UUID resolved from the slug.

Register in `router.ts` after the `/:deviceId/status` line:

```ts
devicesRouter.get("/:deviceId/state", GetDeviceState);
devicesRouter.get("/:deviceId/state/history", GetDeviceStateHistory);
```

Note on route order: Hono matches `/:deviceId/state/history` before the
2-segment `/:deviceId/state` cannot shadow it (different segment counts), so
either order works; keep history second for readability.

Regenerate OpenAPI: `cd apps/server && bun run scripts/generate-openapi.ts`.

**Verify**: `git diff --stat apps/server/openapi.json` shows the file changed;
`pnpm check-types --filter @devicesdk/server` → exit 0.

### Step 7: CLI `state` command

Adds the terminal surface for the same data: latest values, per-state-name
(per-entity) history, and live tailing - so `emitState` output is visible
without the dashboard.

Create `packages/cli/src/api/states.ts` (model on `entities.ts`; uses the
`request` helper from `shared.ts`):

```ts
export interface EntityStateRow {
	entity_id: string;
	value: unknown;
	source: string;
	updated_at?: number;
	created_at?: number;
}

export async function getDeviceState(
	token: string,
	projectId: string,
	deviceId: string,
): Promise<{ states: EntityStateRow[] }> {
	return request<{ states: EntityStateRow[] }>(
		`/v1/projects/${projectId}/devices/${deviceId}/state`,
		{ method: "GET" },
		token,
	);
}

export async function getDeviceStateHistory(
	token: string,
	projectId: string,
	deviceId: string,
	entityId: string,
	opts?: { from?: number; to?: number; limit?: number },
): Promise<{ states: EntityStateRow[] }> {
	const params = new URLSearchParams({ entityId });
	if (opts?.from != null) params.set("from", String(opts.from));
	if (opts?.to != null) params.set("to", String(opts.to));
	if (opts?.limit != null) params.set("limit", String(opts.limit));
	return request<{ states: EntityStateRow[] }>(
		`/v1/projects/${projectId}/devices/${deviceId}/state/history?${params.toString()}`,
		{ method: "GET" },
		token,
	);
}
```

Create `packages/cli/src/commands/state.ts` (`state [project-id] [device-id]`).
Copy the project/device resolution from `logs.ts:279-316` (positional args →
`devicesdk.ts` config → single-device auto-pick) and the table formatting from
`status.ts` (column widths, relative "X ago" timestamps, `--json` via
`emitJsonSuccess`).

Three modes:

1. **Latest (default)**: `getDeviceState` → table `ENTITY / VALUE / SOURCE /
   UPDATED`, or `--json` `{ success, result: { states } }`. No states →
   "No state emitted yet - call DEVICE.emitState() from your script."
2. **History by state name**: `-e, --entity <name>` →
   `getDeviceStateHistory` → ascending table `TIME / VALUE / SOURCE`.
   `-n, --limit` (default 100, clamped 1..2000) mirrors the REST `limit`.
   Values render via a `formatStateValue` helper: numbers/booleans/strings
   raw, objects/arrays `JSON.stringify`'d truncated to ~120 chars, `null` as
   `null`.
3. **Live tail**: `-f, --tail` → watcher WS via the existing `getWatchUrl`
   helper (no `backfillLimit` - the step-4 last-known replay seeds the map on
   connect). Keep a `Map<entity_id, row>`; on every `state` frame (replay or
   live) update the map and print `entity = value (source)`; with `--entity`
   filter to that state name only. Reuse the `logs.ts` reconnect/backoff and
   SIGINT handling (`RECONNECT_*`, `finish()`).

Register in `packages/cli/src/index.ts` after the `status` block (line 262),
mirroring that block's options/help shape and pointing `More:` at
`https://docs.devicesdk.com/cli/state/`.

Add `packages/cli/src/commands/state.test.ts` (vitest; model the ws-mock and
frame-driving structure on `logs.test.ts`, mock `../api.js` for the HTTP
calls). Cover: latest-table output; history output with `--entity`; `--json`
shapes for both; empty-state message; `--limit` clamping; tail frame handling
(replay seeds the map, a live frame overwrites it, `--entity` filters).

Create `apps/docs/src/content/docs/cli/state.md` (model on `logs.md`):
usage/options/examples including `--entity temperature` history lookup, and
note that only user `emitState` calls persist (hardware auto-states like
`gpio_state_changed` are live-only). If the CLI docs index
(`apps/docs/src/content/docs/cli/index.md`) enumerates commands, add a line.

**Verify**: `pnpm test --filter @devicesdk/cli` → all pass including
`state.test.ts`; `pnpm check-types --filter @devicesdk/cli` → exit 0;
`pnpm build` → exit 0 (dist build includes the new command).

### Step 8: Server tests

`apps/server/tests/unit/state-store.test.ts` (bun:test, model the structure on
`tests/unit/db-layer.test.ts`): create an in-memory `Database`, execute the
two CREATE TABLE statements + index from the migration inline, then cover:

1. persist + latest upsert: two `persistAndBroadcastState` calls >1s apart
   (inject timestamps by monkeypatching `Date.now` or spacing via fake
   values in `lastPersistAtByEntity`) → 2 history rows, 1 latest row with the
   second value.
2. coalescing: two calls within `STATE_MIN_PERSIST_INTERVAL_MS` → 1 history
   row, latest row holds the second value.
3. oversized value (`"x".repeat(5000)`) → 0 history rows, 0 latest rows,
   broadcast still called (assert via a fake watcher socket capturing sends).
4. `fetchStateHistory` ascending order + from/to filtering + limit clamp.
5. non-JSON-serializable handling: `undefined` persists as `"null"`.

`apps/server/tests/e2e/device-state.test.ts` (model on
`tests/e2e/device-entities.test.ts`, which shows `TestServer.start()`,
`srv.scaffold(...)`, `srv.get(path, { token })`). The harness exposes
`srv.db` (a `bun:sqlite` `Database` - see `tests/harness.ts:271`). Seed rows
directly:

1. Resolve the device UUID:
   `SELECT id FROM devices WHERE device_slug = ?` via `srv.db.query(...)`.
2. Insert 3 history rows (two entities, spaced timestamps) and 2 latest rows.
3. `GET .../state` → 200, both entities, values JSON-parsed.
4. `GET .../state/history?entityId=temperature` → 200, ascending order.
5. `GET .../state/history` without `entityId` → 400 (Zod validation).
6. Wrong project slug → 404.

**Verify**: `pnpm test --filter @devicesdk/server` → all pass including the
new files. Then `pnpm test --filter @devicesdk/cli` → all pass (regression
gate: CLI watch-frame handling tolerates replayed state frames).

### Step 9: Dashboard service + frame helper

In `apps/dashboard/src/services/api.service.ts` add (near `logService`):

```ts
export interface EntityStateRow {
  entity_id: string;
  value: unknown;
  source: string;
  updated_at?: number;
  created_at?: number;
}

export const stateService = {
  getLatest(projectId: string, deviceId: string) { /* GET .../state */ },
  getHistory(projectId: string, deviceId: string, entityId: string,
             opts?: { from?: number; to?: number; limit?: number }) {
    /* GET .../state/history?... */
  },
};
```

Use the same `call<T>` wrapper and unwrap `result.states` the way existing
services unwrap `result` (copy an adjacent service's idiom).

Create `apps/dashboard/src/lib/stateFrames.ts` - a pure, unit-testable helper:

```ts
export interface StateFrameData { entity_id: string; value: unknown; source: string; }

/** Type guard + apply: returns a NEW map when the frame is a valid state
 *  frame, or null when the frame should be ignored. */
export function applyStateFrame(
  current: ReadonlyMap<string, StateFrameData>,
  frame: { event: string; data?: unknown },
): Map<string, StateFrameData> | null { ... }
```

Valid means: `event === 'state'`, `data` is an object with string
`entity_id`, string `source`, and an `entity_id` under 129 chars.

In `useDeviceStream.ts`: add
`const entityStates = ref<Map<string, StateFrameData>>(new Map());`, replace
the comment at line 116 with a branch that calls `applyStateFrame` and
assigns when non-null, and return `entityStates` from the composable.

**Verify**: `pnpm lint --filter @devicesdk/dashboard` → exit 0.

### Step 10: Dashboard State tab

Create `apps/dashboard/src/components/DeviceStatePanel.vue`:

- Props: `projectId`, `deviceId`.
- On mount: `stateService.getLatest(...)`. Subscribe live updates with its own
  `useDeviceStream(projectId, deviceId)` instance (no `backfillLimit`), call
  `connect()` on mount; merge `entityStates` map changes into the panel's rows
  (the replayed state frames make this consistent on reconnect).
- Render one card per entity: entity_id as label, latest value + relative
  "updated X ago".
- For entities whose latest value is a number: a line chart of history using
  `MetricsChart.vue` (import it; build an `EChartsOption` with a single line
  series, `xAxis type: 'time'`, matching how
  `components/metrics/DeviceMetricsPanel.vue` builds options - copy its
  idiom). Window selector with the metrics windows `1h | 12h | 7d` mapping to
  `from = Date.now() - windowMs`; fetch via `stateService.getHistory` with
  `limit: 2000`. Append live numeric updates to the loaded series.
- Non-numeric values: show the latest value only (JSON-stringified, truncated
  to ~120 chars) with no chart.
- Empty state: "No state yet - call DEVICE.emitState() from your script"
  styled like the empty overlays in `MetricsChart.vue`.

In `DeviceDetailsPage.vue`: add `<q-tab name="state" label="State"
icon="sensors" />` between the `metrics` and `script` tabs (line 58-59), and a
matching `<q-tab-panel name="state" class="q-pa-lg">` rendering
`DeviceStatePanel`. Match the existing panel markup idiom.

**Verify**: `pnpm build` → exit 0 (dashboard compiles).
Then run the app if feasible (`pnpm local`), open a device page, and confirm
the State tab renders its empty state without console errors. If you cannot
run the dev servers in your environment, note that in your report.

### Step 11: Dashboard unit test

`apps/dashboard/tests/unit/stateFrames.spec.ts` (vitest; model file structure
on `tests/unit/metricsFormat.spec.ts`): cover applyStateFrame with (a) a valid
state frame creating an entry, (b) an update overwriting an entry, (c) event
!== 'state' → null, (d) malformed data (missing entity_id, non-object,
oversized entity_id) → null, (e) replay frames treated identically.

**Verify**: `pnpm test:unit --filter @devicesdk/dashboard` → all pass.

### Step 12: Docs line

In `AGENTS.md`, find the "Watch protocol" bullet (starts "**Watch protocol**
(unchanged from the cloud era..."). Append one sentence to that bullet: on
watcher attach the server replays each entity's last-known state as
`{event: "state", data, replay: true}` frames after the initial `status`
frame; `?backfillLimit` continues to control log replay only. Do not edit
CLAUDE.md (it is a symlink to AGENTS.md).

**Verify**: `git diff AGENTS.md` shows only that bullet changed;
`readlink CLAUDE.md` → `AGENTS.md`.

### Step 13: Changesets

Create three changesets (via `pnpm changeset` or by writing the files directly
under `.changeset/`):

- `@devicesdk/server`: minor - "Persist entity state: last-known values and
  history in SQLite with retention, replayed to watchers on attach, plus
  GET .../state and GET .../state/history endpoints."
- `@devicesdk/dashboard`: minor - "New State tab on the device page: latest
  entity values with live updates and history charts."
- `@devicesdk/cli`: minor - "New `devicesdk state` command: latest entity
  values, per-entity history by state name, and live tailing."

Never set a major bump (repo rule).

**Verify**: `ls .changeset/*.md` shows the new files; each names only the
package it describes.

## Test plan

Covered by steps 7 (CLI), 8 (server), and 11 (dashboard). Summary of required
new tests:

- `apps/server/tests/unit/state-store.test.ts` - persist/coalesce/oversize/
  fetch ordering (5 cases listed in step 8).
- `apps/server/tests/e2e/device-state.test.ts` - endpoint auth + shapes
  (6 cases listed in step 8).
- `packages/cli/src/commands/state.test.ts` - command output modes and tail
  frame handling (6 cases listed in step 7).
- `apps/dashboard/tests/unit/stateFrames.spec.ts` - frame guard (5 cases).
- Regression gates: full server suite, CLI suite, dashboard unit suite.

## Done criteria

ALL must hold:

- [ ] `pnpm check-types --filter @devicesdk/server` exits 0
- [ ] `pnpm test --filter @devicesdk/server` exits 0, including the two new
      test files
- [ ] `pnpm check-types --filter @devicesdk/cli` exits 0
- [ ] `pnpm test --filter @devicesdk/cli` exits 0, including `state.test.ts`
- [ ] `pnpm test:unit --filter @devicesdk/dashboard` exits 0, including
      `stateFrames.spec.ts`
- [ ] `pnpm build` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `grep -n "reserved for future UI features" apps/dashboard/src/composables/useDeviceStream.ts`
      returns no matches (the branch is implemented)
- [ ] `grep -n '"state \[project-id' packages/cli/src/index.ts` returns a match
      (the command is registered)
- [ ] `apps/server/openapi.json` contains `devices-get-state` and
      `devices-get-state-history`
- [ ] `apps/docs/src/content/docs/cli/state.md` exists
- [ ] Three changeset files exist (server, dashboard, cli)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 014 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `emitState` / `attachWatcher` excerpts above do not match
  `deviceSession.ts` (plans 007 or 011 may have restructured the runtime).
- Migration numbering conflicts in a way renumbering does not solve (e.g. a
  migration with the same table names already exists - another plan may have
  added state persistence).
- CLI tests fail on watch-frame handling after step 4 - the existing
  `devicesdk logs` path must keep tolerating replayed state frames. Fix the
  new `state` command if it trips; report if the failure is in `logs.ts`
  (its ignore-comment handling should never have changed).
- `tests/harness.ts` does not expose a usable `db` handle for seeding.
- The dashboard has no existing echarts registration covering line/time-axis
  charts (check `apps/dashboard/src/lib/echarts.ts`); registering more echarts
  modules there is allowed, but if the file does not exist at all, report.

## Maintenance notes

- **Plan 001 (Home Assistant)**: the HA integration should treat replayed
  state frames as authoritative last-known values on (re)connect. If 001 has
  already been executed when this lands, file a follow-up to consume them.
- **Plan 012 (KV inspector)** adds endpoints/tabs to the same router and page;
  merge order does not matter but expect trivial conflicts in `router.ts` and
  the tab strip.
- Hardware-message states (`broadcastStateFromMessage`) intentionally do not
  persist. If users ask for GPIO history, extend `persistAndBroadcastState`
  with a per-source policy rather than persisting everything.
- The local dev simulator (`devicesdk dev`) still drops `emitState` calls
  (`localDeviceSender.ts:295-297`); wiring a state feed into the simulator UI
  is a recorded follow-up, not scope here.
- Reviewer should scrutinize: the coalescing map (`lastPersistAtByEntity`)
  growth - it is bounded by distinct entity ids per session, which is fine;
  and that `attachWatcher` state replay stays before log backfill so
  `history_complete` remains the final replay marker.
- Deferred: retention/interval as env config (constants are fine until someone
  asks); downsampling for chart windows beyond 7d; non-numeric history UI.
