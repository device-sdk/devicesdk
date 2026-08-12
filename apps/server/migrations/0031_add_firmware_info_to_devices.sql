-- Migration number: 0031    2026-08-12
-- Firmware version handshake: persist the device-reported firmware version and
-- device type so the API/CLI/dashboard can display what firmware a device runs.

ALTER TABLE devices ADD COLUMN firmware_version TEXT;
ALTER TABLE devices ADD COLUMN device_type TEXT;
