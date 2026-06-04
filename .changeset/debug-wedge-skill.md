---
"@devicesdk/api": patch
---

Restore the per-device DO alarm/user-worker `[DIAG]`/`[DIAG2]` instrumentation behind a `DEVICE_DIAG_LOGS` env flag (off by default, zero overhead via the `diagOn` getter) instead of deleting it. Flip the var to `"1"` + redeploy to re-enable subrequest-wedge diagnostics in `wrangler tail` without re-authoring probes. Also adds a `debug-prod-worker-wedge` skill documenting the tail-first diagnostic methodology and expands the TROUBLESHOOT entry with the dead-ends and the flag toggle.
