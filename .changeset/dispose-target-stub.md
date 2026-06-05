---
"@devicesdk/api": patch
---

Follow-up to the Worker Loader dynamic-worker disposal: `releaseCachedUserWorker` now disposes both the `WorkerStub` handle **and** the `getTarget()` result stub each invocation. Disposing only the handle left the per-invocation target stubs to GC, which lagged under the per-minute cron and still drifted toward "Too many concurrent dynamic workers" after ~an hour. Also makes the WebSocket-upgrade DO storage writes (`deviceMeta`, `connectedSince`, the `connected=1` D1 cache) best-effort so a transient/quota write error degrades instead of failing the connection (which otherwise amplifies reconnect churn).
