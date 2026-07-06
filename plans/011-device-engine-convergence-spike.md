# Plan 011: Design spike - extract the device runtime into `packages/device-engine` (kill workerd)

> **Executor instructions**: This is a DESIGN/SPIKE plan, not a build plan.
> The deliverable is a written report plus disposable spike code - NOT a
> merged refactor. Follow the steps in order, honor the STOP conditions, and
> when done update the status row for this plan in `plans/README.md` - unless
> a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat bbd724d..HEAD -- apps/server/src/runtime packages/cli/src/simulator packages/cli/src/commands/dev.ts`
> If these paths changed since this plan was written, re-verify the "Current
> state" facts before proceeding; on a material mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: M (as a spike; the eventual extraction it specifies is L)
- **Risk**: LOW (no production code is modified)
- **Depends on**: none. NOTE: plan 007 (MQTT transport) touches
  `apps/server/src/runtime/` - if 007 is IN PROGRESS, coordinate timing so the
  inventory doesn't go stale immediately.
- **Category**: direction
- **Planned at**: commit `bbd724d`, 2026-07-06

## Why this matters

`devicesdk dev` still runs the cloud-era **workerd** simulator: `workerd
^1.20250831.0` is a dependency of `@devicesdk/cli` (`packages/cli/package.json`
line 65) - a large per-platform native binary every npm user downloads - and
`packages/cli/src/simulator/` (~570 lines across `deviceBridge.ts`,
`localDeviceSender.ts`, `worker.ts`, `cloudflare-workers.d.ts`) is a second,
divergent implementation of the device-script semantics that the real server
implements in `apps/server/src/runtime/` (~3,265 lines). Every runtime feature
(crons, RPC, KV, console capture) must be built twice and can drift. The
ROADMAP commits to fixing this: "Extract the server's in-process device
runtime (`apps/server/src/runtime/`) into a shared `packages/device-engine`
and run the simulator on it, so local dev semantics are byte-for-byte the
production server's - and the workerd binary dependency goes away."

The extraction is blocked by one hard constraint: **Bun-specific APIs must not
appear in `packages/*`** (repo rule - packages run on plain Node for npm
users), and the runtime currently type-imports `bun:sqlite` in four files.
This spike produces the design that resolves that tension, proves it with
running code on Node, and phases the real migration - so the eventual
implementation plan is low-risk instead of an open-ended rewrite.

## Current state (verified facts to start from)

- `apps/server/src/runtime/` files and sizes: `consoleCapture.ts` (51),
  `cronDispatch.ts` (83), `cronParser.ts` (240), `deviceHub.ts` (70),
  `deviceSender.ts` (529), `deviceSession.ts` (815), `devicesBridge.ts` (78),
  `logStore.ts` (170), `rpcConstants.ts` (18), `scriptHost.ts` (166),
  `types.ts` (58).
- `import type { Database } from "bun:sqlite"` appears in `deviceHub.ts`,
  `deviceSession.ts`, `devicesBridge.ts`, `logStore.ts` (all type-only - the
  value comes from `src/server.ts` boot).
- Other runtime imports from server land: `../foundation/logger`
  (`ServerLogger`), `../foundation/usageMetrics` (`recordDeviceUsage`),
  `../foundation/consts`, `../storage/fsBlobStore` (`FsBlobStore`), plus
  `@devicesdk/core` and `zod` (both Node-safe).
- `consoleCapture.ts` uses `AsyncLocalStorage` (Node-safe);
  `scriptHost.ts` loads user bundles via dynamic `import()` of files
  (Node-safe in principle - verify in the spike).
- CLI side: `packages/cli/src/commands/dev.ts` (418 lines) orchestrates the
  workerd simulator; `packages/cli/src/simulator/worker.ts` (110) is the
  workerd entry; `deviceBridge.ts` (150) and `localDeviceSender.ts` (271)
  replicate DEVICE/DEVICES semantics; `cloudflare-workers.d.ts` (38) types the
  workerd runtime. `apps/simulation` is the Vue UI the dev command serves.
- The device script contract (MUST NOT change - user-facing): class with
  optional `onDeviceConnect/onDeviceDisconnect/onMessage/onCron` + `crons`
  map; env exposes `DEVICE` (command sender + `kv`), `DEVICES` (same-project
  RPC), `VARS`; public methods RPC-callable, lifecycle methods blocked;
  connection-gated crons (missed slots skipped, never caught up).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Server tests (behavior baseline) | `pnpm test --filter @devicesdk/server` | all pass |
| CLI tests | `pnpm test --filter @devicesdk/cli` | all pass |
| Node version check | `node --version` | v22+ (`node:sqlite` availability) |
| Run spike | `node --experimental-strip-types <spike file>` or `npx tsx <spike file>` | see Step 3 |

## Scope

**In scope** (all you may create/modify):

- `plans/011-report-device-engine-spike.md` (create - the main deliverable)
- `plans/spikes/device-engine/**` (create - disposable spike code; NOT a
  workspace package, NOT imported by anything, excluded from `pnpm build`)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- ANY file under `apps/` or `packages/` - this spike changes zero production
  code. The spike may COPY runtime files into `plans/spikes/device-engine/`
  and modify the copies freely.
- `pnpm-workspace.yaml`, `turbo.json`, any `package.json` - the spike dir must
  not become a workspace member.
- Deleting workerd or the simulator - that happens in the future
  implementation plan this spike specifies.

## Git workflow

- `git worktree add .worktrees/device-engine-spike -b device-engine-spike`.
- Commit the report + spike code; conventional message
  `docs(plans): device-engine convergence spike report`.
- `pnpm lint` before committing (Biome may ignore `plans/`; if it complains
  about spike code style, fixing style is fine, fighting the linter is not -
  exclude concerns in the report instead).
- No changeset needed (no workspace package touched); if CI's changeset check
  objects, add an empty one (`pnpm changeset --empty`).

## Steps

### Step 1: Dependency inventory (the coupling map)

Read every file in `apps/server/src/runtime/` and produce a table in the
report: for each file - (a) every import that is not `@devicesdk/core`, `zod`,
or `node:*`; (b) every *member/method* actually used on `Database` (e.g.
`.query().all()`, `.run()`, transactions), on `FsBlobStore`, on
`ServerLogger`, and from `usageMetrics`/`consts`; (c) every place the Bun WS
socket shape (`types.ts` `RuntimeSocket`) leaks in. Method-level granularity
matters: the storage-port design in Step 2 stands on exactly this list.

Also inventory the CLI simulator: which runtime semantics
`deviceBridge.ts`/`localDeviceSender.ts`/`worker.ts` re-implement, and which
`dev.ts` features are simulator-UI-specific (those survive the engine swap).

**Verify**: the report contains both tables; every `bun:sqlite` usage from
`grep -rn "bun:sqlite" apps/server/src/runtime/` appears in them.

### Step 2: Design the `packages/device-engine` seam

Write the proposed design in the report:

- **Ports** (interfaces the engine consumes, defined in the new package):
  suggested starting set - `EngineDb` (the minimal query surface from Step 1's
  method list; decide between a workers-qb-shaped facade vs a narrow
  hand-rolled interface and justify), `EngineBlobReader` (subset of
  `FsBlobStore` the runtime reads), `EngineLogger` (subset of `ServerLogger`),
  `EngineSocket` (replacing the Bun WS type), `Clock` (if `Date.now` needs
  faking for cron tests).
- **Adapters**: `apps/server` implements the ports with `bun:sqlite` +
  existing modules (near-zero behavior change); `packages/cli` implements
  them with `node:sqlite` (Node 22+; state the minimum-Node consequence for
  the CLI's `engines` field) or in-memory equivalents for `dev`.
- **What moves, what stays**: proposed file-by-file disposition
  (`cronParser`/`cronDispatch`/`consoleCapture`/`scriptHost`/`deviceSession`/
  `deviceSender`/`devicesBridge`/`logStore`/`deviceHub`/`types` → engine;
  what remains as server glue).
- **Contract tests**: propose a shared behavior test suite that runs the SAME
  test file against the engine on Bun (server adapters) and on Node (CLI
  adapters) - this is the drift-prevention payoff; name where those tests
  would live and which existing server tests seed them.
- **Migration phasing** for the future implementation plan: e.g. (1) carve
  ports inside `apps/server` in place, (2) move code to
  `packages/device-engine` with server as first consumer, (3) rebuild
  `devicesdk dev` on the engine behind a flag, (4) delete workerd + simulator
  bridge. Each phase independently shippable.

### Step 3: Spike - run a device session on Node

In `plans/spikes/device-engine/` (copies only, never imports into production
code): copy the minimal runtime file set, stub the ports from Step 2
(in-memory KV/logs, console logger, fake socket object), and drive one real
user-script bundle (build `examples/basic` with the CLI build command, or
hand-write a tiny bundle matching the script contract) through:

1. session connect → `onDeviceConnect` fires;
2. an inbound message → `onMessage` fires and a `DEVICE` command round-trips
   through the fake socket;
3. a cron fire via the real `cronParser`/`cronDispatch`;
4. `console.log` inside the handler lands in the captured log store, not the
   host console;
5. `device_kv` get/put through the stub storage.

Run it on **Node 22** (not Bun - that is the whole point):
`npx tsx plans/spikes/device-engine/run.ts` (or
`node --experimental-strip-types`). Record every place a copied file needed
editing to run on Node - that list IS the true coupling cost and goes in the
report verbatim.

**Verify**: the spike script exits 0 on Node and prints evidence of all five
behaviors; the report includes the command, Node version, and the
edits-required list.

### Step 4: Write the report and recommendation

`plans/011-report-device-engine-spike.md` containing: the Step 1 tables, the
Step 2 design, the Step 3 results, open questions for the owner (e.g. minimum
Node version bump for the CLI; whether `devicesdk dev` keeps the simulation
UI protocol unchanged), a go/no-go recommendation, and a drafted skeleton for
the follow-up implementation plan (phases from Step 2 with effort estimates).

**Verify**: report file exists; a reader who has seen neither this plan nor
the code can follow the recommendation section.

## Test plan

No production tests change. The spike run (Step 3) is the executable
verification; `pnpm test --filter @devicesdk/server` and
`--filter @devicesdk/cli` must still pass untouched (proves you changed no
production code).

## Done criteria

- [ ] `plans/011-report-device-engine-spike.md` exists with inventory tables,
      port design, spike results, phased migration proposal, go/no-go
- [ ] Spike runs on Node 22 (`npx tsx plans/spikes/device-engine/run.ts`
      exits 0, or the report documents precisely why not - which is itself a
      valid spike outcome)
- [ ] `git status` shows changes ONLY under `plans/`
- [ ] `pnpm test --filter @devicesdk/server` and
      `pnpm test --filter @devicesdk/cli` still pass (nothing touched)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- You are tempted to modify anything under `apps/` or `packages/` - the fix is
  to copy into the spike dir, never to edit in place.
- `scriptHost.ts`'s dynamic `import()` of version-keyed bundle files does not
  work on Node for a reason that can't be stubbed (e.g. loader semantics) -
  document the exact error in the report and stop; that finding changes the
  design materially.
- The spike needs more than ~2 days of effort - the design doc with a partial
  spike and an honest "unproven" section beats a heroic spike.
- Plan 007's executor is concurrently modifying `apps/server/src/runtime/` -
  coordinate or pause; an inventory of moving code is worthless.

## Maintenance notes

- The follow-up implementation plan (to be written from the report) is where
  workerd actually dies; do not delete it here.
- Plans 007 (MQTT transport) and the runtime interact: the engine seam should
  anticipate a transport abstraction (WS today, MQTT session tomorrow) -
  Step 2's `EngineSocket` port should be checked against plan 007's
  `deviceSession` touches before the real extraction starts.
- If the owner rejects a CLI minimum-Node bump to 22, the `node:sqlite`
  adapter choice must be revisited (better-sqlite3 violates the zero-native-
  deps preference; an in-memory/file-JSON store for dev may suffice - `dev`
  sessions are ephemeral).
