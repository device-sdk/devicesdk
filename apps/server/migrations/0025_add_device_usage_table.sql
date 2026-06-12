-- Migration number: 0025    2026-06-09
-- Usage metrics move from Analytics Engine into 5-minute SQLite buckets
-- (300 s is the finest granularity any metrics window uses). Counters are
-- accumulated with upserts; the janitor prunes buckets older than 7 days.
CREATE TABLE IF NOT EXISTS device_usage (
    device_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    bucket_ts INTEGER NOT NULL,
    messages_in INTEGER NOT NULL DEFAULT 0,
    messages_out INTEGER NOT NULL DEFAULT 0,
    bytes_in INTEGER NOT NULL DEFAULT 0,
    bytes_out INTEGER NOT NULL DEFAULT 0,
    cron_fires INTEGER NOT NULL DEFAULT 0,
    connected_seconds INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (device_id, bucket_ts)
);

CREATE INDEX IF NOT EXISTS idx_device_usage_project_bucket ON device_usage(project_id, bucket_ts);
