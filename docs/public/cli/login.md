---
title: devicesdk login
description: Authenticate the CLI with the DeviceSDK API
social_image: /og-images/docs/cli/login.png
---

## Usage

```bash
devicesdk login [flags]
devicesdk logout
devicesdk whoami [--json]
```

## Description

`devicesdk login` opens your browser to authorise the CLI and writes an access/refresh token pair to `~/.devicesdk/auth.json`. Subsequent CLI calls use the saved tokens automatically; the access token rotates on its own via the refresh token.

`devicesdk logout` removes `~/.devicesdk/auth.json` and revokes the refresh token server-side.

`devicesdk whoami` prints the currently-authenticated user. Pass `--json` for machine-readable output:

```json
{ "success": true, "result": { "id": "user_…", "email": "you@example.com" } }
```

## CI / non-interactive auth

Set `DEVICESDK_TOKEN` (or `DEVICESDK_AUTH_TOKEN`) to an API token issued from the dashboard's *Tokens* page. The CLI checks the env var before falling back to `~/.devicesdk/auth.json`.

```bash
export DEVICESDK_TOKEN=dsdk_…
devicesdk deploy
```

Use a token with the *minimum* scope needed — most CI flows only need `deploy` and `flash`.

## Switching deployments

`DEVICESDK_API_URL` selects which API the CLI talks to (defaults to `https://api.devicesdk.com`). A token issued against one URL is **not** accepted by another — re-run `login` if you switch:

```bash
DEVICESDK_API_URL=http://localhost:8787 devicesdk login
```

## Related

- [`missing_credentials`](/docs/errors/missing_credentials/) — error reference for the unauthenticated path.
- [`invalid_cli_token`](/docs/errors/invalid_cli_token/) — error reference for the expired/revoked path.
- [`devicesdk env`](/docs/concepts/env-vars/) — for project-scoped *secrets*; tokens are user-scoped.
