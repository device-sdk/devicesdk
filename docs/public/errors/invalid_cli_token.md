---
title: 'Error: invalid_cli_token'
description: 'A `dsdk_*` CLI token is missing, expired, or revoked.'
social_image: /og-images/docs/errors/invalid_cli_token.png
---

## What it means

The request used a `dsdk_*`-prefixed token, but it didn't match any active CLI token in the database. CLI tokens are short-lived; they're paired with refresh tokens and rotate every few hours.

The CLI itself usually handles this transparently — `devicesdk login` writes both an access token and a refresh token to `~/.devicesdk/auth.json`, and subsequent calls auto-refresh. If you're seeing this code surface, it usually means refresh has also failed.

## Common causes and fixes

- **You haven't logged in.** Run `devicesdk login`.
- **The refresh token also expired** (typical after long inactivity). Run `devicesdk login` to issue a fresh pair.
- **You revoked the token from the dashboard.** Run `devicesdk login` to issue a new one.
- **You're sharing one `~/.devicesdk/auth.json` across machines.** Each `devicesdk login` rotates the refresh token; only the most recent machine has the live one. Run `devicesdk login` on whichever machine got 401'd.
- **You set `DEVICESDK_TOKEN` to a non-CLI token.** Use a regular API token from the dashboard for that env var.

## Related

- [`invalid_token`](../invalid_token/) — generic-token variant of this error.
- [`missing_credentials`](../missing_credentials/) — no token at all.
