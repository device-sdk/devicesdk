---
"@devicesdk/api": patch
---

Add temporary diagnostic logging to the per-device cron `alarm()` to root-cause a "Too many subrequests by single Worker invocation" wedge. When a tick is anomalous (pending-event backlog non-empty, more than one device socket, or any watcher socket present), it logs the pending-event count, device/watcher socket counts, the drain duration, and the onCron duration. This is observation-only (no behavior change) and is meant to be removed once the fan-out source is identified. Merging it also forces a fresh API deploy, which restarts the affected Durable Object.
