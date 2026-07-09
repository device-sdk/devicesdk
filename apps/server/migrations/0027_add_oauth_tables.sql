-- Migration number: 0027    2026-07-08
-- OAuth 2.1 authorization server for the bundled MCP endpoint (/mcp). Adds
-- dynamic client registration (RFC 7591) storage and short-lived, single-use
-- authorization codes for the PKCE authorization_code grant.

-- OAuth 2.1 dynamic client registrations (RFC 7591) for MCP clients.
CREATE TABLE oauth_clients (
    id TEXT PRIMARY KEY,               -- client_id (uuid)
    client_name TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,       -- JSON array of exact-match URIs
    created_at INTEGER NOT NULL
);

-- Short-lived authorization codes (10 min), single use.
CREATE TABLE oauth_auth_codes (
    id TEXT PRIMARY KEY,               -- uuid
    code_hash TEXT NOT NULL UNIQUE,    -- HMAC of the code, same scheme as tokens
    client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,      -- PKCE S256 challenge
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX idx_oauth_auth_codes_expires ON oauth_auth_codes(expires_at);

-- API tokens gain an optional expiry. NULL = never expires (all existing
-- tokens and dashboard-created tokens). OAuth-minted MCP tokens set it.
ALTER TABLE tokens ADD COLUMN expires_at INTEGER;
