---
title: 'Error: missing_credentials'
description: 'The request had no Bearer token, session cookie, or CLI token.'
social_image: /og-images/docs/errors/missing_credentials.png
---

## What it means

The DeviceSDK API rejected the request because it could not find any of the three accepted authentication mechanisms:

- A `Authorization: Bearer <token>` header — used by the dashboard and by direct API consumers.
- A session cookie set by the dashboard login flow.
- A `dsdk_*` CLI token — issued by `devicesdk login` and stored at `~/.devicesdk/credentials.json`.

## Common causes and fixes

- **You're calling the API directly without an auth header.** Add `Authorization: Bearer <token>`. Get a token with `devicesdk login --host http://<server>:8080` (writes to `~/.devicesdk/credentials.json`) or from your server's dashboard *Tokens* page.
- **You're running the CLI without logging in.** The CLI has no default server. Run `devicesdk login --host http://<server>:8080` and re-try.
- **No server is configured.** The host comes from (in order) `DEVICESDK_API_URL`, the `--host` flag, or the host saved in `~/.devicesdk/credentials.json` by `devicesdk login`. If none is set, requests have nowhere to authenticate — log in with `--host` pointing at your server.
- **Your script is running in CI without a token.** Issue a token from your server's dashboard and set `DEVICESDK_TOKEN` on the CI runner (point it at your server with `DEVICESDK_API_URL`).

## Related

- [`invalid_token`](../invalid_token/) — the request *did* carry a token, but it didn't match any account.
- [`invalid_cli_token`](../invalid_cli_token/) — same idea, scoped to CLI tokens.
