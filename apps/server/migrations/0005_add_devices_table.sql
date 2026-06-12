-- Migration number: 0005    2025-12-23
-- Add devices table for per-device script management

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  device_slug TEXT NOT NULL,
  name TEXT,
  description TEXT,
  current_version_id TEXT,
  last_connected_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, device_slug)
);

CREATE INDEX idx_devices_project_id ON devices(project_id);
