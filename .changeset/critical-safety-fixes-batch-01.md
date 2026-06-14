---
"@devicesdk/server": patch
"@devicesdk/website": patch
---

Critical safety and correctness fixes (Audit Batch 01).

- **Database atomicity**: `D1CompatDatabase.batch()` now executes statements inside a synchronous `db.transaction(...)` callback, restoring atomicity for callers that rely on `c.env.DB.batch()` (entity upserts, env-var sets, CLI token refresh).
- **Health probes**: added unauthenticated `GET /health` and `GET /ready` endpoints. `/health` returns a lightweight `{success:true,result:{status:"ok"}}`; `/ready` verifies SQLite is writable and returns 503 if not. The troubleshooting docs now reference both endpoints.
- **Device socket replacement**: when a new connection replaces a stale one, the outgoing socket's pending commands are rejected immediately and its `connectedSeconds` usage is recorded before the replacement takes over.
- **Process crash protection**: `server.ts` now registers `unhandledRejection` (log) and `uncaughtException` (log + `process.exit(1)`) handlers in addition to the existing `SIGTERM`/`SIGINT` shutdown logic.
