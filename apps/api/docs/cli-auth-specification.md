# CLI Authentication Specification

This document specifies the authentication flow between the DeviceSDK CLI and the API backend. It implements a simplified device authorization flow inspired by OAuth 2.0 Device Authorization Grant (RFC 8628), optimized for CLI tools.

---

## Overview

The authentication flow is designed to be:
- **Simple** - No full OAuth 2.1 server implementation required
- **Secure** - Short-lived codes, PKCE-like verification
- **User-friendly** - Browser-based approval, no password entry in terminal

---

## Flow Diagram

```
┌─────────┐                              ┌─────────┐                    ┌─────────┐
│   CLI   │                              │   API   │                    │ Browser │
└────┬────┘                              └────┬────┘                    └────┬────┘
     │                                        │                              │
     │ 1. POST /v1/cli/auth/start             │                              │
     │ ────────────────────────────────────►  │                              │
     │                                        │                              │
     │ { device_code, user_code, url }        │                              │
     │ ◄────────────────────────────────────  │                              │
     │                                        │                              │
     │ 2. Open browser to url                 │                              │
     │ ───────────────────────────────────────────────────────────────────►  │
     │                                        │                              │
     │                                        │  3. GET /cli/auth?code=xxx   │
     │                                        │ ◄─────────────────────────── │
     │                                        │                              │
     │                                        │  4. User approves (logged in)│
     │                                        │ ◄─────────────────────────── │
     │                                        │                              │
     │ 5. POST /v1/cli/auth/poll              │                              │
     │    { device_code }                     │                              │
     │ ────────────────────────────────────►  │                              │
     │                                        │                              │
     │ { access_token, refresh_token }        │                              │
     │ ◄────────────────────────────────────  │                              │
     │                                        │                              │
```

---

## API Endpoints

### 1. `POST /v1/cli/auth/start`

Initiates the CLI authentication flow.

**Request:**
```http
POST /v1/cli/auth/start
Content-Type: application/json

{
  "client_id": "devicesdk-cli"
}
```

**Response (200):**
```json
{
  "success": true,
  "result": {
    "device_code": "DSDK_DEVICE_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "user_code": "ABCD-1234",
    "verification_url": "https://api.devicesdk.io/cli/auth",
    "verification_url_complete": "https://api.devicesdk.io/cli/auth?code=ABCD-1234",
    "expires_in": 900,
    "interval": 5
  }
}
```

**Response Fields:**
| Field | Description |
|-------|-------------|
| `device_code` | Secret code for polling (never shown to user) |
| `user_code` | Short code for user to enter (if manual entry needed) |
| `verification_url` | URL for manual code entry |
| `verification_url_complete` | URL with code pre-filled (CLI opens this) |
| `expires_in` | Seconds until codes expire (15 minutes) |
| `interval` | Minimum seconds between poll requests |

**Implementation Notes:**
- Generate `device_code` as secure random: `DSDK_DEVICE_` + 32 random hex chars
- Generate `user_code` as human-readable: `[A-Z]{4}-[0-9]{4}`
- Store in database with expiry timestamp
- One device_code per user_code mapping

---

### 2. `GET /cli/auth` (Web Page)

Browser page where user approves the CLI login.

**Query Parameters:**
| Param | Description |
|-------|-------------|
| `code` | The `user_code` from step 1 (optional, can be entered manually) |

**Behavior:**
1. If user not logged in → redirect to Google OAuth, then back
2. Display approval page showing:
   - The user code
   - "DeviceSDK CLI is requesting access"
   - Approve / Deny buttons
3. On approve → mark device_code as approved, associate with user
4. On deny → mark device_code as denied
5. Show success/error message

**Approval Page HTML (simplified):**
```html
<div class="approval-card">
  <h1>DeviceSDK CLI Login</h1>
  <p>A CLI tool is requesting access to your account.</p>
  
  <div class="code-display">
    <span>Code: </span>
    <strong>ABCD-1234</strong>
  </div>
  
  <p>Make sure this matches the code shown in your terminal.</p>
  
  <div class="actions">
    <button type="submit" name="action" value="approve">Approve</button>
    <button type="submit" name="action" value="deny">Deny</button>
  </div>
</div>
```

---

### 3. `POST /v1/cli/auth/poll`

Poll for authorization status.

**Request:**
```http
POST /v1/cli/auth/poll
Content-Type: application/json

{
  "device_code": "DSDK_DEVICE_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Response - Pending (200):**
```json
{
  "success": true,
  "result": {
    "status": "pending"
  }
}
```

**Response - Approved (200):**
```json
{
  "success": true,
  "result": {
    "status": "approved",
    "access_token": "dsdk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "refresh_token": "dsdk_refresh_xxxxxxxxxxxxxxxxxxxxxxxx",
    "expires_in": 86400,
    "token_type": "Bearer",
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "name": "User Name"
    }
  }
}
```

**Response - Denied (200):**
```json
{
  "success": true,
  "result": {
    "status": "denied"
  }
}
```

**Response - Expired (400):**
```json
{
  "success": false,
  "error": "authorization_expired"
}
```

**Response - Rate Limited (429):**
```json
{
  "success": false,
  "error": "slow_down"
}
```

**Implementation Notes:**
- CLI should poll at `interval` seconds (default 5)
- Return 429 if polling too fast
- Delete device_code record after returning tokens
- Tokens are created fresh on approval (not stored as device_code)

---

### 4. `POST /v1/cli/auth/refresh`

Refresh an expired access token.

**Request:**
```http
POST /v1/cli/auth/refresh
Content-Type: application/json

{
  "refresh_token": "dsdk_refresh_xxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Response (200):**
```json
{
  "success": true,
  "result": {
    "access_token": "dsdk_new_token_xxxxxxxxxxxxxxxxxxxxxxxx",
    "expires_in": 86400,
    "token_type": "Bearer"
  }
}
```

**Response - Invalid (401):**
```json
{
  "success": false,
  "error": "invalid_refresh_token"
}
```

**Implementation Notes:**
- Refresh tokens have longer expiry (30 days)
- Refresh token is rotated on each use (optional, for security)
- Old refresh tokens invalidated after use

---

### 5. `POST /v1/cli/auth/revoke`

Revoke a token (logout).

**Request:**
```http
POST /v1/cli/auth/revoke
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "refresh_token": "dsdk_refresh_xxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Response (200):**
```json
{
  "success": true,
  "result": {
    "revoked": true
  }
}
```

**Implementation Notes:**
- Invalidates both access and refresh token
- Silently succeeds even if token already invalid

---

## Database Schema

### New Table: `cli_auth_codes`

```sql
CREATE TABLE cli_auth_codes (
  id TEXT PRIMARY KEY,
  device_code TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL UNIQUE,
  user_id TEXT,                        -- NULL until approved
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, denied
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_cli_auth_codes_device_code ON cli_auth_codes(device_code);
CREATE INDEX idx_cli_auth_codes_user_code ON cli_auth_codes(user_code);
CREATE INDEX idx_cli_auth_codes_expires_at ON cli_auth_codes(expires_at);
```

### New Table: `cli_tokens`

```sql
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
```

---

## Token Format

### Access Token
```
dsdk_<32 random hex characters>
```
Example: `dsdk_a1b2c3d4e5f6789012345678901234567890`

- Prefix `dsdk_` for identification
- 32 hex chars = 128 bits of entropy
- Expires in 24 hours

### Refresh Token
```
dsdk_refresh_<32 random hex characters>
```
Example: `dsdk_refresh_f6789012345678901234567890a1b2c3d4e5`

- Prefix `dsdk_refresh_` for identification
- Expires in 30 days
- Can be used once to get new access + refresh tokens

### Device Code (Internal)
```
DSDK_DEVICE_<32 random hex characters>
```
- Never shown to users
- Used by CLI to poll for status
- Expires in 15 minutes

### User Code (User-Facing)
```
[A-Z]{4}-[0-9]{4}
```
Example: `ABCD-1234`

- Easy to read and type
- Shown in terminal and verified in browser
- Case-insensitive matching

---

## Security Considerations

### Token Storage
- Store only **hashed** tokens in database (SHA-256)
- CLI stores plain tokens in `~/.devicesdk/credentials.json`
- Set file permissions to `0600` on credentials file

### Code Generation
```javascript
// Device code
const deviceCode = 'DSDK_DEVICE_' + crypto.randomBytes(16).toString('hex');

// User code (easy to type)
const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I, O
const userCode = Array(4).fill(0).map(() => letters[Math.floor(Math.random() * letters.length)]).join('')
  + '-'
  + Array(4).fill(0).map(() => Math.floor(Math.random() * 10)).join('');

// Access token
const accessToken = 'dsdk_' + crypto.randomBytes(16).toString('hex');

// Refresh token  
const refreshToken = 'dsdk_refresh_' + crypto.randomBytes(16).toString('hex');
```

### Rate Limiting
- `/v1/cli/auth/start`: 10 requests per minute per IP
- `/v1/cli/auth/poll`: Enforce `interval` seconds between requests per device_code
- `/v1/cli/auth/refresh`: 10 requests per minute per token

### Expiration
| Item | Lifetime |
|------|----------|
| Device code | 15 minutes |
| User code | 15 minutes |
| Access token | 24 hours |
| Refresh token | 30 days |

---

## CLI Implementation

### Login Command

```typescript
async function login() {
  // 1. Start auth flow
  const startResponse = await fetch(`${API_URL}/v1/cli/auth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'devicesdk-cli' }),
  });
  
  const { result } = await startResponse.json();
  const { device_code, user_code, verification_url_complete, interval, expires_in } = result;
  
  // 2. Show user code and open browser
  console.log(`\nOpening browser to complete login...`);
  console.log(`\nIf browser doesn't open, visit: ${verification_url_complete}`);
  console.log(`\nVerification code: ${user_code}\n`);
  
  await open(verification_url_complete);
  
  // 3. Poll for approval
  const deadline = Date.now() + (expires_in * 1000);
  
  while (Date.now() < deadline) {
    await sleep(interval * 1000);
    
    const pollResponse = await fetch(`${API_URL}/v1/cli/auth/poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code }),
    });
    
    const pollResult = await pollResponse.json();
    
    if (!pollResult.success) {
      if (pollResult.error === 'slow_down') {
        await sleep(5000); // Back off
        continue;
      }
      throw new Error(pollResult.error);
    }
    
    const { status, access_token, refresh_token, expires_in: tokenExpiry, user } = pollResult.result;
    
    if (status === 'approved') {
      // 4. Save credentials
      await saveCredentials({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: Date.now() + (tokenExpiry * 1000),
        email: user.email,
      });
      
      console.log(`✓ Logged in as ${user.email}`);
      return;
    }
    
    if (status === 'denied') {
      throw new Error('Login was denied');
    }
    
    // status === 'pending', continue polling
    process.stdout.write('.');
  }
  
  throw new Error('Login timed out');
}
```

### Token Refresh

```typescript
async function refreshAccessToken() {
  const credentials = await loadCredentials();
  
  if (!credentials?.refreshToken) {
    throw new Error('Not logged in');
  }
  
  const response = await fetch(`${API_URL}/v1/cli/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: credentials.refreshToken }),
  });
  
  const { success, result, error } = await response.json();
  
  if (!success) {
    // Refresh token invalid, need to re-login
    await deleteCredentials();
    throw new Error('Session expired, please login again');
  }
  
  await saveCredentials({
    ...credentials,
    accessToken: result.access_token,
    expiresAt: Date.now() + (result.expires_in * 1000),
  });
  
  return result.access_token;
}
```

### Authenticated Request

```typescript
async function authenticatedFetch(url: string, options: RequestInit = {}) {
  let credentials = await loadCredentials();
  
  if (!credentials) {
    throw new Error('Not logged in. Run `devicesdk login` first.');
  }
  
  // Check if token expired (with 5 min buffer)
  if (credentials.expiresAt < Date.now() + 300000) {
    credentials.accessToken = await refreshAccessToken();
  }
  
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${credentials.accessToken}`,
    },
  });
}
```

---

## API Implementation (Backend)

### Middleware: Authenticate CLI Token

```typescript
async function authenticateCLIToken(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing authorization' }, 401);
  }
  
  const token = authHeader.slice(7);
  
  // Check if it's a CLI token (dsdk_ prefix) or API token
  if (token.startsWith('dsdk_')) {
    // CLI token - hash and lookup
    const tokenHash = await sha256(token);
    
    const cliToken = await c.env.DB
      .prepare('SELECT * FROM cli_tokens WHERE access_token_hash = ? AND expires_at > ?')
      .bind(tokenHash, Date.now())
      .first();
    
    if (!cliToken) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401);
    }
    
    // Update last_used_at
    await c.env.DB
      .prepare('UPDATE cli_tokens SET last_used_at = ? WHERE id = ?')
      .bind(Date.now(), cliToken.id)
      .run();
    
    // Set user context
    c.set('userId', cliToken.user_id);
    c.set('tokenType', 'cli');
  } else {
    // Existing API token logic
    // ... (keep existing token auth)
  }
  
  return next();
}
```

### Endpoint: Start Auth

```typescript
app.post('/v1/cli/auth/start', async (c) => {
  const deviceCode = 'DSDK_DEVICE_' + crypto.randomUUID().replace(/-/g, '');
  const userCode = generateUserCode(); // ABCD-1234
  const expiresAt = Date.now() + (15 * 60 * 1000); // 15 minutes
  
  await c.env.DB
    .prepare(`
      INSERT INTO cli_auth_codes (id, device_code, user_code, status, created_at, expires_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `)
    .bind(crypto.randomUUID(), deviceCode, userCode, Date.now(), expiresAt)
    .run();
  
  return c.json({
    success: true,
    result: {
      device_code: deviceCode,
      user_code: userCode,
      verification_url: `${c.env.APP_URL}/cli/auth`,
      verification_url_complete: `${c.env.APP_URL}/cli/auth?code=${userCode}`,
      expires_in: 900,
      interval: 5,
    },
  });
});
```

### Endpoint: Poll Auth

```typescript
app.post('/v1/cli/auth/poll', async (c) => {
  const { device_code } = await c.req.json();
  
  const authCode = await c.env.DB
    .prepare('SELECT * FROM cli_auth_codes WHERE device_code = ?')
    .bind(device_code)
    .first();
  
  if (!authCode) {
    return c.json({ success: false, error: 'invalid_device_code' }, 400);
  }
  
  if (authCode.expires_at < Date.now()) {
    // Clean up expired code
    await c.env.DB
      .prepare('DELETE FROM cli_auth_codes WHERE id = ?')
      .bind(authCode.id)
      .run();
    return c.json({ success: false, error: 'authorization_expired' }, 400);
  }
  
  if (authCode.status === 'pending') {
    return c.json({ success: true, result: { status: 'pending' } });
  }
  
  if (authCode.status === 'denied') {
    await c.env.DB
      .prepare('DELETE FROM cli_auth_codes WHERE id = ?')
      .bind(authCode.id)
      .run();
    return c.json({ success: true, result: { status: 'denied' } });
  }
  
  if (authCode.status === 'approved') {
    // Generate tokens
    const accessToken = 'dsdk_' + crypto.randomUUID().replace(/-/g, '');
    const refreshToken = 'dsdk_refresh_' + crypto.randomUUID().replace(/-/g, '');
    const expiresIn = 86400; // 24 hours
    
    // Store hashed tokens
    await c.env.DB
      .prepare(`
        INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        crypto.randomUUID(),
        authCode.user_id,
        await sha256(accessToken),
        await sha256(refreshToken),
        Date.now(),
        Date.now() + (expiresIn * 1000)
      )
      .run();
    
    // Get user info
    const user = await c.env.DB
      .prepare('SELECT id, email, name FROM user WHERE id = ?')
      .bind(authCode.user_id)
      .first();
    
    // Clean up auth code
    await c.env.DB
      .prepare('DELETE FROM cli_auth_codes WHERE id = ?')
      .bind(authCode.id)
      .run();
    
    return c.json({
      success: true,
      result: {
        status: 'approved',
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresIn,
        token_type: 'Bearer',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
    });
  }
});
```

### Web Page: Approval

```typescript
// GET /cli/auth - Render approval page
app.get('/cli/auth', authenticateUser, async (c) => {
  const code = c.req.query('code');
  
  if (!code) {
    return c.html(renderCodeEntryPage());
  }
  
  const authCode = await c.env.DB
    .prepare('SELECT * FROM cli_auth_codes WHERE user_code = ? AND status = ?')
    .bind(code.toUpperCase(), 'pending')
    .first();
  
  if (!authCode || authCode.expires_at < Date.now()) {
    return c.html(renderErrorPage('Invalid or expired code'));
  }
  
  return c.html(renderApprovalPage(code));
});

// POST /cli/auth - Handle approval/denial
app.post('/cli/auth', authenticateUser, async (c) => {
  const { code, action } = await c.req.parseBody();
  const userId = c.get('userId');
  
  const authCode = await c.env.DB
    .prepare('SELECT * FROM cli_auth_codes WHERE user_code = ? AND status = ?')
    .bind(code.toUpperCase(), 'pending')
    .first();
  
  if (!authCode || authCode.expires_at < Date.now()) {
    return c.html(renderErrorPage('Invalid or expired code'));
  }
  
  const newStatus = action === 'approve' ? 'approved' : 'denied';
  
  await c.env.DB
    .prepare('UPDATE cli_auth_codes SET status = ?, user_id = ? WHERE id = ?')
    .bind(newStatus, action === 'approve' ? userId : null, authCode.id)
    .run();
  
  if (action === 'approve') {
    return c.html(renderSuccessPage('CLI login approved. You can close this window.'));
  } else {
    return c.html(renderSuccessPage('CLI login denied.'));
  }
});
```

---

## Migration

### `0008_add_cli_auth_tables.sql`

```sql
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
```

---

## Summary

This authentication flow provides:

1. **User Experience** - Browser-based approval, no passwords in terminal
2. **Security** - Hashed tokens, short expiry, refresh token rotation
3. **Simplicity** - No full OAuth server, minimal database tables
4. **CLI Compatibility** - Works in headless environments with manual code entry

The flow is similar to how GitHub CLI (`gh auth login`) and Google Cloud CLI work.
