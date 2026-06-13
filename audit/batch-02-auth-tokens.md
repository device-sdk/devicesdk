# Audit Batch 02 — Auth & Token Hardening

These items reduce the blast radius of leaked or compromised credentials.

## 1. Remove the legacy plaintext `tokens.token` column

**Files:**
- `apps/server/migrations/0004_add_tokens_table.sql`
- `apps/server/migrations/0013_hash_api_tokens.sql`
- `apps/server/src/endpoints/tokens/createApiToken.ts`
- `apps/server/src/endpoints/tokens/listApiTokens.ts`

Migration `0004` created `tokens.token NOT NULL`; migration `0013` added `token_hash` but did not drop or clear the old column. `createApiToken` now stores `""`, but pre-existing rows may still hold plaintext tokens, and `listApiTokens` falls back to `t.token.slice(-4)` if `last_four` is null.

**Action:** Add a migration to `UPDATE tokens SET token = '' WHERE token != ''`, then `ALTER TABLE tokens DROP COLUMN token`. Stop referencing `tokens.token` in list code.

---

## 2. Use salted/HMAC token hashing instead of raw SHA-256

**Files:** `apps/server/src/foundation/tokenHash.ts`, `createApiToken.ts`, `pollAuth.ts`

API tokens, CLI tokens, and refresh tokens are stored as `SHA-256(token)` without a salt. Without a salt, precomputation/rainbow-table attacks are possible if a token is ever predictable or reused elsewhere.

**Action:** Use HMAC-SHA-256 with a server-side secret, or a salted slow hash (e.g., bcrypt/argon2id at a moderate cost) for token storage. Update all token verification paths.

---

## 3. Increase CLI token entropy

**File:** `apps/server/src/endpoints/cli-auth/utils.ts`

CLI access/refresh tokens are generated from 16 random bytes (128 bits) hex-encoded. For long-lived refresh tokens (30 days), this is on the lower end.

**Action:** Increase token generation to at least 32 bytes (256 bits) for both access and refresh tokens.

---

## 4. Purge expired `cli_tokens` in the janitor

**File:** `apps/server/src/janitor.ts`

Expired refresh tokens accumulate indefinitely because the janitor does not delete `cli_tokens` rows.

**Action:** Add `DELETE FROM cli_tokens WHERE expires_at < ?1` to the janitor cleanup routine.
