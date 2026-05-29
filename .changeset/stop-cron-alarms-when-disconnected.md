---
"@devicesdk/api": patch
---

Stop firing device cron schedules while no device is connected. Previously, a script that declared a frequent cron (e.g. `*/1 * * * *`) kept waking its Durable Object — and re-invoking the user Worker — every minute forever after the device disconnected, billing for work that could never reach hardware. The alarm handler now cancels the alarm when no device WebSocket is present and leaves the schedule in storage; reconnecting re-arms it (preserving each cron's `nextFireAt`). Pending user-worker events queued for a transient retry are unaffected.
