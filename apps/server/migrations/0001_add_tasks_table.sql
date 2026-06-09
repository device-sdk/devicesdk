-- Migration number: 0001 	 2025-06-19T18:13:02.648Z
CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    picture TEXT,
    email TEXT NOT NULL UNIQUE,
    verified_email INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL
        CONSTRAINT user_sessions_user_id_fk
            REFERENCES user
            ON UPDATE CASCADE ON DELETE CASCADE,
    token      TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
