---
title: devicesdk login
description: Authenticate the CLI against the DeviceSDK server you run
social_image: /og-images/docs/cli/login.png
---

## Usage

```bash
devicesdk login --host http://<server>:8080
devicesdk logout
devicesdk whoami [--json]
```

## Description

DeviceSDK is self-hosted, so the CLI has **no default server URL**. On first use you must tell it which server to talk to with `--host`:

```bash
devicesdk login --host http://<server>:8080
```

`devicesdk login` opens your browser to run a device-code flow against **your** server, then writes the access/refresh token pair **and the host** to `~/.devicesdk/credentials.json` (file mode `0600`). Subsequent CLI calls reuse the saved host and tokens automatically; the access token rotates on its own via the refresh token.

`devicesdk logout` removes `~/.devicesdk/credentials.json` and revokes the refresh token server-side.

`devicesdk whoami` prints the currently-authenticated user. Pass `--json` for machine-readable output:

```json
{ "success": true, "result": { "id": "user_…", "email": "you@example.com" } }
```

## CI / non-interactive auth

Set `DEVICESDK_TOKEN` to a `dsdk_…` API token issued from your dashboard's *Tokens* page (the dashboard your server serves). The CLI checks this env var before falling back to `~/.devicesdk/credentials.json`. In CI, also set the server URL with `DEVICESDK_API_URL` since there's no saved credentials file there:

```bash
export DEVICESDK_API_URL=http://<server>:8080
export DEVICESDK_TOKEN=dsdk_…
devicesdk deploy
```

Use a token with the *minimum* scope needed — most CI flows only need `deploy` and `flash`.

## Switching servers

`DEVICESDK_API_URL` selects which DeviceSDK server the CLI talks to. There is **no default** — it simply overrides the host saved in `~/.devicesdk/credentials.json`. A token issued against one server is **not** accepted by another, so re-run `login` if you switch:

```bash
devicesdk login --host http://192.168.1.50:8080
```

## Related

- [`missing_credentials`](/docs/errors/missing_credentials/) — error reference for the unauthenticated path.
- [`invalid_cli_token`](/docs/errors/invalid_cli_token/) — error reference for the expired/revoked path.
- [`devicesdk env`](/docs/concepts/env-vars/) — for project-scoped *secrets*; tokens are user-scoped.
