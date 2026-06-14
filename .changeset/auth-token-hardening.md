---
"@devicesdk/server": minor
"@devicesdk/dashboard": patch
---

Audit Batch 02 — Auth & Token Hardening

- Drops the legacy plaintext `tokens.token` column after clearing any residual values.
- Replaces unsalted SHA-256 token storage with HMAC-SHA-256 using a server-side secret (`API_TOKEN_SECRET`); legacy SHA-256 hashes remain verifiable during the transition.
- Persists an auto-generated API token secret under `DATA_DIR` when `API_TOKEN_SECRET` is not provided.
- Increases CLI access/refresh token entropy from 16 bytes (128 bits) to 32 bytes (256 bits).
- Purges expired `cli_tokens` rows in the janitor.
- Updates dashboard E2E seed fixtures to use `token_hash`/`last_four` now that `tokens.token` is removed.
