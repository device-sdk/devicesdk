-- Migration number: 0009    2025-12-27
-- Add entrypoint field to device_scripts table

ALTER TABLE device_scripts ADD COLUMN entrypoint TEXT NOT NULL DEFAULT 'default';
