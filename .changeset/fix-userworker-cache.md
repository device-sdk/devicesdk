---
"@devicesdk/api": patch
---

Cache the user-worker stub on the Device Durable Object instance so that repeated `LOADER.get()` + `getEntrypoint().getTarget()` calls don't trip the runtime's "Too many concurrent dynamic workers" limit. Without caching, every alarm drain, inter-device RPC, and cron dispatch resolved a fresh stub for the same `workerId`; under normal traffic this caused `getOrCreateUserWorker` to fail with `Too many concurrent dynamic workers`, the alarm queue to retry through 1→2→4→8→16 s backoff, and `onDeviceConnect` / `onMessage` to be silently dropped after `MAX_USER_EVENT_ATTEMPTS`. The cache is keyed by `${projectId}:${deviceId}:${versionId}`, so a script redeploy invalidates it automatically; DO eviction discards it naturally.
