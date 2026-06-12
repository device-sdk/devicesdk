-- CLI authentication codes for device flow
CREATE TABLE cli_auth_codes (
  id TEXT PRIMARY KEY,
  device_code TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL UNIQUE,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_cli_auth_codes_device_code ON cli_auth_codes(device_code);
CREATE INDEX idx_cli_auth_codes_user_code ON cli_auth_codes(user_code);
CREATE INDEX idx_cli_auth_codes_expires_at ON cli_auth_codes(expires_at);

-- CLI access and refresh tokens
CREATE TABLE cli_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  access_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX idx_cli_tokens_user_id ON cli_tokens(user_id);
CREATE INDEX idx_cli_tokens_access_token_hash ON cli_tokens(access_token_hash);
CREATE INDEX idx_cli_tokens_refresh_token_hash ON cli_tokens(refresh_token_hash);
