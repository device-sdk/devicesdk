-- Migration number: 0029    2026-08-08
-- Audit Batch: user_sessions.token previously held session tokens in
-- plaintext, so a DB dump yielded instantly usable sessions. The bundled
-- SQLite has no sha256(), so existing rows cannot be re-hashed in SQL; delete
-- them (one-time re-login) rather than leave raw tokens behind. New sessions
-- are stored HMAC-SHA256 hashed by the server (foundation/tokenHash.ts), like
-- CLI and API tokens.
DELETE FROM user_sessions;
