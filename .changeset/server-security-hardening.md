---
"@devicesdk/server": patch
---

Security and correctness hardening across the server:

- Session tokens are now stored as HMAC-SHA256 hashes (one-time re-login on
  upgrade; previously raw tokens in the DB enabled session forgery from a
  database dump)
- New `POST /v1/auth/change-password` (verifies the current password, re-hashes
  with argon2id, revokes other sessions); account deletion now requires the
  account password; both endpoints are rate-limited
- CLI device-code approval no longer prefills the code from the query string
  (closes a session-binding phishing vector) and the approval pages are
  rate-limited; CSRF cookies now honor `SECURE_COOKIES` (plain-HTTP LAN
  installs previously 403'd every approval)
- MCP loopback URLs are built from charset-validated, per-segment-encoded path
  segments with a normalization check (a tool call could previously address
  unrelated routes, e.g. deleting a project via an env-var key of `..`)
- OAuth auth codes are consumed atomically (concurrent double-exchange can no
  longer mint two tokens); redirect URIs are allowlisted; consent page shows
  client id + redirect URI; `code_verifier` length enforced
- Runtime: crons can no longer fire while the device is offline; `connected_seconds`
  accrues incrementally instead of landing in one bucket at disconnect;
  `device_kv` enforces key/value size limits; `history_complete` is always sent
  when backfill was requested
- Blob deletion drains all list pages; project/device/user deletion now removes
  `device_kv`, `device_logs`, and `device_usage` orphans; `fsBlobStore.list`
  cursor is a stable last-key token
- Metrics windows are aligned to the 5-minute bucket grid; project totals
  exclude deleted devices; batch script uploads report per-device errors with a
  `partial` status
- Firmware-token rotation is scoped by project+device UUID (same device slug in
  two projects no longer invalidates each other's tokens)
- Missing DB indexes (`tokens`, `device_logs`, `device_usage`, sessions),
  `PRAGMA busy_timeout`, atomic blob writes, bounded `PORT` validation,
  inter-process migration locking
