# Cloudflare Worker Loader - stale `getTarget()` stub fans out subrequests instead of failing fast

> Internal record of a Workers runtime issue we hit and a minimal repro to send to
> the Cloudflare team. Found while root-causing the "device reconnects every few
> minutes" wedge (see `TROUBLESHOOT.md` 2026-06-04 + PR #140). Not shipped publicly.

## Message to send (chat / support ticket)

**Worker Loader: a cached `getTarget()` stub used after its resolving invocation ends fans out non-resolving subrequests and hangs to the ~60s wall, instead of throwing a disposed-stub error.**

Hit this on a Durable Object that uses Worker Loader to run per-tenant code. We resolve the dynamic worker once and cache the entrypoint's `getTarget()` result on the DO instance (`this.cached`) to avoid re-paying `LOADER.get()` + `getTarget()` on every alarm tick.

**Repro shape:** DO `alarm()` #1 resolves `env.LOADER.get(id, factory).getEntrypoint("ProxyEntrypoint").getTarget()` and stashes the returned stub on `this`. A *later* invocation (next alarm, or any subsequent request) calls a method on that cached stub.

**Expected:** the stub is invocation-scoped, so calling it later should fail fast with a clear "disposed/invalid stub" error. (We accept that holding it is unsupported - we just want a clean, deterministic failure.)

**Actual:** the method call **fans out subrequests that never resolve**. The invocation hits the per-invocation subrequest cap and surfaces - misleadingly - as `Too many subrequests by single Worker invocation` thrown from *our* method, not from the stub call. `wrangler tail --format json` shows `executionModel: durableObject`, `wallTime ≈ 60000`, `cpuTime: 0`, `outcome: ok`, with `Date.now()` frozen across the whole invocation (no awaited I/O completes). For a single-threaded DO this freezes the actor for ~60s per tick. Re-resolving the stub in the same invocation it's used always works fine - the failure is purely "stub crossed an invocation boundary."

**Why this looks like a runtime bug, not just misuse:** even if cross-invocation reuse is unsupported, the manifestation should be a deterministic disposed-stub error, not a silent subrequest fan-out + wall-clock hang with a misattributed error message. We also found an internal note referencing **EW-9769 ("cross-request stub invalidation is fixed in the runtime")** - if invalidation were complete for the `LOADER.get(...).getEntrypoint(...).getTarget()` path, this would throw cleanly. It doesn't, so this looks like incomplete invalidation for the dynamic-worker entrypoint path specifically.

**Environment:** `compatibility_date: 2026-04-24`, `worker_loaders` binding, account has Worker Loader enabled.

**Ask:**
1. Is cross-invocation `getTarget()` stub use supposed to throw?
2. If so, can the runtime fail fast (disposed-stub error) instead of fanning out subrequests and hanging to the wall limit?
3. Does EW-9769's invalidation cover this dynamic-worker entrypoint path?

## How we worked around it

Made the cached stub strictly invocation-scoped: clear `cachedUserWorker` at every DO
invocation entry point that resolves a worker (`alarm()`, `handleRemoteCall()`), so each
invocation re-resolves a fresh stub; the cache only serves *intra-invocation* reuse. A
stable `LOADER.get` id keeps it one underlying worker, so re-resolving per invocation does
not trip "Too many concurrent dynamic workers". See `apps/api/src/durableObjects/lib/device.ts`.

## Running the repro

```bash
cd repro
npm install
npx wrangler deploy
npx wrangler tail --format json        # second terminal

curl https://<your-worker>/resolve              # invocation A: caches the stub
curl "https://<your-worker>/call?mode=cached"   # invocation B: HANGS ~60s -> "Too many subrequests"
curl "https://<your-worker>/call?mode=fresh"    # control: returns {"result":"echo:pong"} fast
```

In `wrangler tail` the `mode=cached` call shows `wallTime ≈ 60000 / cpuTime 0` with a frozen
`Date.now()`; `mode=fresh` is sub-100ms.

## Caveats (be upfront with the team)

- This standalone repro is reconstructed faithfully from our `device.ts` usage but has **not**
  been re-run end-to-end here. If `mode=cached` doesn't wedge on the first immediate call (the
  child isolate may still be warm), insert a `sleep 60` before it to force isolate eviction - in
  prod the resolving and using invocations were per-minute DO alarms ~60s apart, which reproduced
  every time.
- The `as any` casts in the repro are only to keep it dependency-light; they're not part of the bug.
