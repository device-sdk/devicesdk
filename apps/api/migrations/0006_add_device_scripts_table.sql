-- Migration number: 0006    2025-12-23
-- Add device_scripts table for per-device script versioning

CREATE TABLE device_scripts (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  message TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX idx_device_scripts_device_id ON device_scripts(device_id);
