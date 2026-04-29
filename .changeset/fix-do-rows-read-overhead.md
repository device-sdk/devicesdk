---
"@devicesdk/api": patch
---

Cut Durable Object `rows_read` overhead on the device WebSocket hot path. Each idle keepalive ping previously cost ~7 storage row reads — `restoreMessageCount` (2) + `getDeviceMeta` (1) + `enqueueUserWorkerEvent` (1) + the immediately-following alarm fire (3) — burning the daily quota on the free tier with one connected device. This change short-circuits the `webSocketMessage` handler when `message.type === "ping"` so keepalives no longer touch storage, removes a redundant `PENDING_USER_EVENTS_KEY` re-read inside `alarm()` (any new event enqueued during drain already arms its own alarm), caches a `_hasCrons` tristate so devices without cron schedules skip the `CRON_STORAGE_KEY` read on every alarm, and throttles the `device_logs` overflow-cleanup query (which scans up to `LOG_MAX_STORED` rows) from "every 10 writes" to "every 100 writes AND no more than once per 6 hours".
