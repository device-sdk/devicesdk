-- Migration number: 0022    2026-06-09
-- Local-account auth (self-hosted): argon2id hash via Bun.password.
-- Replaces Google OAuth; Google profile columns stay for back-compat.
ALTER TABLE user ADD COLUMN password_hash TEXT;
