---
"@devicesdk/api": patch
---

Dispose the Worker Loader dynamic-worker handle per DO invocation to stop the "Too many concurrent dynamic workers" wedge.

`getOrCreateUserWorker` re-resolves the user worker every invocation (PR #140, to avoid the stale cross-invocation `getTarget()` stub). The `WorkerStub` returned by `env.LOADER.get()` owns a child isolate, but the code only dropped the JS reference and let GC reclaim it. Under the per-minute cron alarm, GC lags far behind, so the isolates pile up until `LOADER.get()` itself throws `Too many concurrent dynamic workers` — after which **every** user-worker init fails: `onCron`/`onDeviceConnect` never run (device display goes dark / stuck), each failed init burns the ~60 s wall, and that starves the device WebSocket ping/pong into a reconnect loop. It self-recovered only on an API redeploy (fresh isolate) and then re-accumulated over ~2 h.

Fix: hold the `WorkerStub` handle on `cachedUserWorker` and dispose it (`Symbol.dispose`) at every invocation entry point that re-resolves (`alarm()`, `handleRemoteCall()`), plus on the init failure path. This is the Worker Loader's intended `using`-style lifecycle; disposal is a local resource release (not an RPC into the child isolate), so it stays safe across the now-stale handle. Keeps at most one dynamic isolate alive per device between ticks.
