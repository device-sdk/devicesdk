---
title: "Error: missing_credentials"
description: "The request had no Bearer token, session cookie, or CLI token."
---

# Error: missing_credentials

> The request had no Bearer token, session cookie, or CLI token.


## What it means

The DeviceSDK API rejected the request because it could not find any of the three accepted authentication mechanisms:

- A `Authorization: Bearer <token>` header — used by the dashboard and by direct API consumers.
- A session cookie set by the OAuth flow — used by the dashboard.
- A `dsdk_*` CLI token — issued by `devicesdk login` and stored at `~/.devicesdk/auth.json`.

## Common causes and fixes

- **You're calling the API directly without an auth header.** Add `Authorization: Bearer <token>`. Get a token with `devicesdk login` (writes to `~/.devicesdk/auth.json`) or from the dashboard's API tokens page.
- **You're running the CLI without logging in.** Run `devicesdk login` and re-try.
- **`DEVICESDK_API_URL` is set to a different deployment.** A token issued against `https://api.devicesdk.com` is not accepted by a local dev API at `http://localhost:8787`. Either run `devicesdk login` against the new URL or unset `DEVICESDK_API_URL`.
- **Your script is running in CI without a token.** Issue a token from the dashboard, set `DEVICESDK_TOKEN` (or `DEVICESDK_AUTH_TOKEN`) on the CI runner.

## Related

- [`invalid_token`](../invalid_token/) — the request *did* carry a token, but it didn't match any account.
- [`invalid_cli_token`](../invalid_cli_token/) — same idea, scoped to CLI tokens.

