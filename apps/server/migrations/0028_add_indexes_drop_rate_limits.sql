-- Migration number: 0028    2026-08-08
-- Indexes for the hot lookup paths: token_hash is consulted on every
-- API-token request (full table scan before), user_id backs list/count
-- queries, and expires_at/created_at/bucket_ts are the janitor's sweep keys.
CREATE INDEX IF NOT EXISTS idx_tokens_token_hash ON tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_device_logs_created_at ON device_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_device_usage_bucket_ts ON device_usage(bucket_ts);

-- rate_limits was created in 0015 but never read or written (the in-memory
-- limiter in src/foundation/rateLimit.ts is authoritative) - drop it.
DROP INDEX IF EXISTS idx_rate_limits_key;
DROP INDEX IF EXISTS idx_rate_limits_expires;
DROP TABLE IF EXISTS rate_limits;
