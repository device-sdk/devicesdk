---
"@devicesdk/api": patch
---

Add temporary `[DIAG2]` instrumentation to `getOrCreateUserWorker` to root-cause the "Too many subrequests" per-device alarm wedge. Logs whether each user-worker invocation took the warm (cached cross-invocation stub) or cold (fresh `LOADER.get` + `getTarget`) path, plus the cached stub's age and the `getTarget()` latency. This is observation-only (no behaviour change) and is meant to be removed once the fan-out source is confirmed. Merging it also forces a fresh API deploy, restarting the affected Durable Object.
