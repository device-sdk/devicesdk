---
title: "Error: invalid_token"
description: "The token on the request does not match any active session, API token, or legacy token."
url: http://localhost:1313/docs/errors/invalid_token/
---

# Error: invalid_token

> The token on the request does not match any active session, API token, or legacy token.


## What it means

The API recognised that the request had a token, but couldn't find a matching account in any of:

- Active dashboard sessions in the `user_sessions` table.
- Hashed API tokens in the `tokens` table.
- Legacy unhashed tokens in the same table (now migrated on read).

This is distinct from [`invalid_cli_token`](../invalid_cli_token/), which fires for CLI tokens specifically (those start with `dsdk_`).

## Common causes and fixes

- **The dashboard session expired.** Sign in again at <https://dash.devicesdk.com/>.
- **The API token was revoked from the dashboard's *Tokens* page.** Generate a new one and update wherever it's stored.
- **You copied the token with leading/trailing whitespace.** Verify the header value is exactly the token, no quotes, no newlines.
- **You're using a token issued against a different deployment.** Tokens from `api.devicesdk.com` won't authenticate against a local API.

## Related

- [`missing_credentials`](../missing_credentials/) — no token at all on the request.
- [`invalid_cli_token`](../invalid_cli_token/) — the CLI-specific variant of this error.

