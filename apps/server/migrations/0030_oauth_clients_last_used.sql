-- Migration number: 0030    2026-08-09
-- Audit follow-up: oauth_clients had no usage signal, so the janitor's
-- 180-day sweep deleted every registration older than the window - including
-- actively used MCP clients (they re-register on the next flow, so the impact
-- was a redundant re-registration, but the intent was 'never used').
-- Add a last_used_at column stamped on every successful token exchange;
-- existing rows are seeded with created_at so they are not swept immediately.
ALTER TABLE oauth_clients ADD COLUMN last_used_at INTEGER;
UPDATE oauth_clients SET last_used_at = created_at WHERE last_used_at IS NULL;
