---
"@devicesdk/api": patch
---

Remove the temporary `[DIAG]`/`[DIAG2]` instrumentation added to root-cause the per-device alarm "Too many subrequests" wedge (now fixed in #140 by making the user-worker stub invocation-scoped). No behaviour change — strips the observation-only logging from `alarm()` and `getOrCreateUserWorker`. The root cause and the "never cache a getTarget() stub across invocations" rule are captured in TROUBLESHOOT.md, CLAUDE.md, and the cloudflare-runtime-limitations skill.
