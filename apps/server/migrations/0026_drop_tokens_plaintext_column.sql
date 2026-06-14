-- Migration number: 0026    2026-06-14
-- Audit Batch 02: remove the legacy plaintext tokens.token column now that
-- token_hash (+ last_four) has replaced it. Clear any residual plaintext first
-- so the column can be dropped without leaking old values.
UPDATE tokens SET token = '' WHERE token != '';
ALTER TABLE tokens DROP COLUMN token;
