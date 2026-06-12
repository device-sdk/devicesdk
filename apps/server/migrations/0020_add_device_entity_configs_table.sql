CREATE TABLE device_entity_configs (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    UNIQUE(device_id, entity_id)
);

CREATE INDEX idx_entity_configs_device_id ON device_entity_configs(device_id);
