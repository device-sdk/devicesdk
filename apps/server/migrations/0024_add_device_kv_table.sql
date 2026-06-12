-- Migration number: 0024    2026-06-09
-- Per-device KV (user scripts' DEVICE.kv) and internal runtime state
-- (cron schedules under the __internal: prefix). Replaces Durable Object
-- key-value storage. Values are JSON-encoded.
CREATE TABLE IF NOT EXISTS device_kv (
    device_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (device_id, key)
);
