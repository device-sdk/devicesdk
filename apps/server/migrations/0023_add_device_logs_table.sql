-- Migration number: 0023    2026-06-09
-- Device logs move from per-device Durable Object SQLite storage into the
-- main database (self-hosted server runs a single SQLite file).
CREATE TABLE IF NOT EXISTS device_logs (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_logs_device_created ON device_logs(device_id, created_at);
