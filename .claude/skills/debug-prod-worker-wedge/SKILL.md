---
name: debug-prod-worker-wedge
description: Use when a production Cloudflare Worker or Durable Object is hanging, slow, hitting "Too many subrequests"/"Too many concurrent dynamic workers", timing out, or a device/cron/stream is misbehaving in prod and you can't reproduce it locally. Covers the wrangler-tail-first diagnostic loop, decoding tail event signatures (wallTime/cpuTime/outcome), the instrument→deploy→read methodology, and the discipline that keeps you from guessing fixes.
---

# Debugging a production Worker / Durable Object "wedge"

A *wedge* is a prod invocation that hangs, burns its wall-clock budget, or trips a per-invocation limit — often intermittently and **not reproducible locally** (Worker Loader, DO hibernation, real device timing, and the subrequest cap don't exist in `vitest`/miniflare). This skill is the playbook that root-caused the "device reconnects every few minutes" wedge (per-device DO `alarm()` pinned at 60 s wall every minute) after three wrong guesses. Read it before you start guessing fixes.

The golden rule: **observe first, hypothesize from data, deploy a fix at most once per confirmed cause.** Each prod deploy is a multi-minute cycle; a guessed fix that's wrong costs that cycle *and* muddies the signal.

## Step 0 — get the prod debug recipes

This repo's recipes (account id, `wrangler tail`/`d1 execute`/`r2 object get` against `--env production`, the worker name) live in the auto-memory `reference_prod_debug_access.md` and the per-device cron architecture is in `CLAUDE.md`. Prod reads are classifier-gated — expect to ask the user to approve "read-only prod reads" once.

## Step 1 — tail the worker as JSON, not text

```bash
cd apps/api
# Run in the background (it streams until timeout); parse the file afterwards.
timeout 300 npx wrangler tail --env production --format json 2>/dev/null > tail.json
```

`--format json` is non-negotiable: the text format hides `wallTime`, `cpuTime`, `outcome`, `executionModel`, and the structured `event`. Tail only samples (it won't show every event under load), and a wedged invocation is **delivered to tail when it ends**, so a 60 s-wall event shows up ~60 s after its `scheduledTime`.

Parse with a tiny Python decoder (events are concatenated JSON objects, not an array):

```python
import json
data = open("tail.json").read()
dec = json.JSONDecoder(); i = 0; objs = []
while i < len(data):
    while i < len(data) and data[i] in " \n\r\t": i += 1
    if i >= len(data): break
    try: o, j = dec.raw_decode(data, i); objs.append(o); i = j
    except: i += 1
for o in objs:
    if o.get("executionModel") != "durableObject": continue
    print(o.get("wallTime"), o.get("cpuTime"), o.get("outcome"),
          json.dumps(o.get("event"))[:80],
          [m.get("message", [""])[0] if isinstance(m.get("message"), list) else "" for m in o.get("logs", [])])
```

## Step 2 — decode the event signature

| Field / pattern | Means |
|---|---|
| `executionModel: durableObject` | a DO invocation (vs `stateless` = the main Worker) |
| `event.scheduledTime` present | a **DO alarm** firing (per-device cron, etc.) |
| `event.request` present | a `fetch()` (WebSocket upgrade, HTTP route) |
| `event.rpcMethod: "foo"` | an **RPC / facet call** into the DO (e.g. a `DeviceSender` `kvGet`) |
| `event.getWebSocketEvent` | a Hibernation-API WebSocket message/close/error |
| `wallTime ≈ 60000`, `cpuTime ≈ 0`, `outcome: ok` | **hung on I/O, not CPU** — the invocation sat at its ~60 s wall limit waiting. Classic subrequest fan-out / hanging await. (My memory note: `wallTime≈60000 / cpu 0` = subrequest fan-out heuristic.) |
| log: `Too many subrequests by single Worker invocation` | the **per-invocation subrequest cap** (~1000) was exceeded |
| log: `Too many concurrent dynamic workers` | Worker Loader spawned too many live workers — usually a non-stable `LOADER.get` id |

### The killer tell: frozen `Date.now()`

In Workers, **`Date.now()` only advances across *completed* I/O** (it's pinned to the last I/O for determinism). So if you instrument with `Date.now()` deltas and they read **0 ms** while `wallTime` is 60 s, then **no awaited I/O completed** in the whole invocation — the subrequests were issued **fire-and-forget and never resolved**, and the runtime waited out the wall limit for them. That single observation tells you to look at *what RPC handle / fire-and-forget call* is fanning out, not at CPU or awaited latency. (Workers also block `Date.now()`/`Math.random()` from advancing in some contexts — don't trust wall-clock math inside a wedged invocation.)

## Step 3 — rule out the user/tenant code before blaming infra

If a tenant script runs in the invocation (Worker Loader / user functions), **fetch the actually-deployed artifact and read it** — don't assume the repo source is what's running:

```bash
# resolve the R2 key from D1, then:
npx wrangler r2 object get "<bucket>/<userId>/<projectSlug>/<deviceSlug>/<versionId>.js" --remote --pipe > deployed.js
```

Count the real subrequests the tenant code issues per entry point. If it's ~3 RPCs but the cap is ~1000, the fan-out is **infrastructural**, and you can stop staring at the tenant code.

## Step 4 — instrument → deploy → read, with a *discriminator*

When static analysis can't locate the fan-out, add **targeted, observation-only logging** and deploy it (in this repo, merging an `apps/api/**` change auto-deploys via `deploy.yml` *and restarts the DO*). Then tail one tick.

The trick that makes one deploy decisive: **log something that distinguishes your top two hypotheses.** For the stale-stub wedge, the discriminator was `cache=warm` vs `cache=cold` on the path that resolves the user worker — one tick proved every 60 s wedge was `cache=warm` (reused cross-invocation stub) and fast ticks were `warm-without-a-hook-call`. Without a discriminator you just confirm "it's still broken."

Tips:
- Gate noisy logs behind an anomaly condition so you only emit on the interesting ticks.
- Log **phase boundaries** (before/after each awaited call) and a **monotonic counter** so a *loop* shows up as a flood.
- Keep the instrumentation behind a `[DIAG]`-style prefix.

### This repo already has a gated probe — flip it, don't re-author it

The DO alarm / user-worker `[DIAG]`/`[DIAG2]` instrumentation that found the stale-stub wedge is **permanently in `apps/api/src/durableObjects/lib/device.ts`**, gated behind the `DEVICE_DIAG_LOGS` env var (read via `this.diagOn`; zero overhead — no storage reads or logs — when off). To investigate a recurrence:

1. Set `DEVICE_DIAG_LOGS` to `"1"` in `apps/api/wrangler.jsonc` (the top-level **and** the `env.production` `vars` blocks) and deploy (merge an `apps/api/**` change, or `wrangler deploy --env production`). This restarts the DOs.
2. `wrangler tail --env production --format json` and look for `[DIAG]`/`[DIAG2]` lines (`cache=warm/cold`, `ageMs`, `getTargetMs`, `pendingEvents`, `deviceSockets`, `drainMs`, `diagOnCronMs`, `diagAlarmMs`).
3. Set it back to `"0"` and redeploy when done.

Add new probes the same way — behind `this.diagOn` — instead of deleting them after each investigation.

## Step 5 — confirm the fix against ground truth, not vibes

A wedge fix is confirmed when the **signature is gone** *and* a **ground-truth metric** moves — not when it "looks better":

- Tail again: `grep -c "Too many subrequests"` → 0; max DO `wallTime` back to tens/hundreds of ms.
- Check durable ground truth that the symptom maps to. For "device reconnecting", poll D1 twice ~90 s apart and assert `last_connected_at` is **byte-identical** (one continuous connection) with `secs_since_connect` climbing monotonically. A "looks connected" snapshot isn't proof; a stable timestamp across samples is.
- Distinguish *benign* residual events from the bug. One reconnect in ~15 min with **no wedge in tail** is a normal NAT-idle drop cleanly auto-recovered (see the half-open/ping-pong notes in `cloudflare-runtime-limitations` + TROUBLESHOOT.md) — not a regression.

## Worked example — the stale cross-invocation stub (June 2026)

Symptom: a connected ESP32 clock reconnected every 2–3 min; per-device cron `alarm()` ran 60 s (`wallTime≈60000`, `cpu 0`) every minute logging `Too many subrequests` from `onCron`.

Three wrong guesses (each cost a cycle — learn from them):
1. **Unbounded event-drain** (bounded it to 50/tick). Didn't fix it — the wedge persisted with `pendingEvents = 0`.
2. **Pending-event backlog** (added `[DIAG]` that only logged on backlog). The wedged ticks had *no* backlog, so the diag never fired — a useful null result that killed the theory.
3. **Ghost/zombie sockets** (closed stale device sockets on reconnect — a real latent bug, PR #136, but not *this*). Wedge continued.

What actually found it: a second probe (`[DIAG2]`) logging `cache=warm/cold` + stub age in `getOrCreateUserWorker`, deployed and tailed for one minute. Every 60 s wedge was `cache=warm`; `diagAlarmMs`/`diagOnCronMs` read `0` (frozen `Date.now()`); even a 10 s-old stub wedged.

Root cause: the DO cached the Worker-Loader `getTarget()` handle and reused it **across invocations**. That handle is an invocation-scoped child-isolate RPC stub; calling a method on a stale one fans out subrequests that never resolve → caps out → 60 s wall → freezes the single-threaded DO → starves the device WebSocket ping/pong → firmware half-open reconnect loop. Fix (PR #140): clear the cache at every invocation entry point so each invocation re-resolves a fresh stub; keep only intra-invocation reuse. See the full entry in `TROUBLESHOOT.md` and the rule in `.claude/skills/cloudflare-runtime-limitations`.

## Discipline checklist

- [ ] Tailed prod as JSON and decoded the signature before forming a hypothesis.
- [ ] Checked `cpuTime` — near 0 with high `wallTime` means I/O/fan-out, not CPU.
- [ ] Read the *deployed* tenant artifact, not the repo source.
- [ ] Each instrumentation deploy carried a **discriminator** that distinguishes hypotheses.
- [ ] Did not ship a guessed fix; shipped one fix per confirmed cause.
- [ ] Confirmed via signature-gone **and** a ground-truth metric over time.
- [ ] Removed `[DIAG]` instrumentation in a follow-up and captured the root cause in TROUBLESHOOT.md + the relevant skill.
