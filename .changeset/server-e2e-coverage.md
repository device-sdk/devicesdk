---
"@devicesdk/server": patch
---

Add an end-to-end test suite for the server, taking line coverage to ~96% (and
function coverage ~89%), well past the 85% bar. A new in-process harness
(`apps/server/tests/harness.ts`) boots the real Bun server on an ephemeral port
and drives it over HTTP plus device/watcher WebSockets, with a device simulator
that speaks the firmware protocol. The suite covers auth + CLI device-code flow,
projects, devices, entities, scripts (upload/deploy/batch/pruning), tokens,
env-vars, firmware download + checksum patching, metrics, logs, the db layer,
cron parsing, and the device runtime (sessions, sender surface, KV, inter-device
RPC, log/state broadcasts, backfill). CI gains a `Server E2E Tests` job that runs
the suite with a project-wide ≥85% coverage gate (`scripts/coverage-gate.ts`).
