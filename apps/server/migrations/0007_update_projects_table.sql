-- Migration number: 0007    2025-12-23
-- Add optional fields to projects table

ALTER TABLE projects ADD COLUMN name TEXT;
ALTER TABLE projects ADD COLUMN description TEXT;
ALTER TABLE projects ADD COLUMN updated_at INTEGER;
