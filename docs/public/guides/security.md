---
title: Security guide
description: Account model, first-user bootstrap, API token scoping, in-process script trust model, and ALLOW_REGISTRATION
weight: 6
---

DeviceSDK is a self-hosted, single-tenant server. Security decisions that cloud platforms handle for you become your responsibility as the operator. This guide covers the account model, authentication, API token scoping, the script execution trust model, and hardening recommendations.

## Account model

DeviceSDK uses a **local account model** - there is no third-party identity provider, OAuth sign-in, or phone-home to devicesdk.com. All accounts and credentials are stored in the SQLite database on your server.

- Accounts are created through the dashboard sign-up page.
- The first account created on a fresh server is always allowed, regardless of `ALLOW_REGISTRATION`.
- After the first account is created, set `ALLOW_REGISTRATION=false` to prevent further sign-ups.
- There is no built-in role system - all accounts have equal access to all devices and scripts on the server.

## First-user bootstrap risk

On a fresh install, **registration is open until the first account is created**. If your server is reachable from the internet before you complete setup, an attacker could claim the first account.

**Mitigate this:**
1. Keep the server firewalled or LAN-only during initial setup.
2. Immediately create your admin account after the container first starts.
3. Set `ALLOW_REGISTRATION=false` in your environment and restart the container.

```yaml
environment:
  ALLOW_REGISTRATION: "false"
```

The first registered user is always permitted even with `ALLOW_REGISTRATION=false`, so this setting is safe to use from day one.

## Session cookies

Dashboard logins produce a session cookie. By default the `Secure` flag is **off** to allow plain-HTTP LAN installs. When you run the server behind an HTTPS reverse proxy, you must enable the Secure flag:

```yaml
environment:
  SECURE_COOKIES: "true"
```

Without this, the session cookie can be transmitted over HTTP and may be intercepted. See the [self-hosting guide](/docs/guides/self-hosting/) for reverse proxy setup.

## API tokens

API tokens (created in the dashboard under **Settings → API Tokens**) are long-lived credentials for programmatic access. They are stored as HMAC-SHA-256 hashes keyed with a server-side secret (`API_TOKEN_SECRET`). The raw token is shown once at creation time.

**Scoping:** All API tokens grant the same level of access as the account that created them. There are currently no read-only or device-scoped token variants - treat every token as full-account credentials.

**Revocation:** Tokens can be revoked individually in the dashboard or via the CLI with `devicesdk token revoke`. Revocation takes effect immediately.

**Rotation:** If you suspect a token is compromised, revoke it and create a new one. Rotating the `API_TOKEN_SECRET` invalidates all existing tokens and forces all users to re-authenticate - use this only if you believe the secret itself is compromised.

## CLI tokens

The DeviceSDK CLI (`devicesdk login`) issues short-lived access tokens and longer-lived refresh tokens. These use the same HMAC-SHA-256 storage as API tokens. Access tokens expire in 24 hours; refresh tokens expire in 30 days.

## In-process script execution trust model

> **Important:** Deployed device scripts run **in-process with full server privileges**.

When you deploy a script to a device, the server loads the compiled JavaScript bundle using a dynamic `import()` within the server process. The script runs in the same Node.js/Bun runtime as the server itself - it shares the same memory space, file system access, and network access.

**What this means in practice:**
- A script can read files from `DATA_DIR`, make outbound network requests, or interact with the host system.
- There is **no sandbox** or container isolation between user scripts and the server.
- This is intentional for a self-hosted, user-owned stack: you control both the server and the scripts you deploy.

**Trust model:**
- The server trusts all deployed scripts fully. Review scripts before deploying them.
- Only give dashboard access to people you trust to run arbitrary code on your server.
- If you need to run scripts from an untrusted source, use a separate DeviceSDK instance.

This design matches how other self-hosted automation platforms (Home Assistant, Node-RED) work: the server trusts the operator, and the operator is responsible for the scripts they run.

## `ALLOW_REGISTRATION` and multi-user scenarios

DeviceSDK is designed for single-user or small trusted-group deployments. If you share your server with family or teammates:

- All accounts have equal access - any user can see and modify all devices and scripts.
- Consider giving each user their own server instance if you need isolation.
- Keep `ALLOW_REGISTRATION=false` after provisioning accounts to prevent unauthorized sign-ups.

## Transport security checklist

- [ ] Server is behind an HTTPS reverse proxy in production.
- [ ] `SECURE_COOKIES=true` is set.
- [ ] `ALLOW_REGISTRATION=false` after first account creation.
- [ ] Port 8080 is not directly exposed to the internet (reverse proxy handles TLS).
- [ ] `DATA_DIR` volume and backups are protected with appropriate filesystem permissions.
- [ ] API tokens and CLI credentials are not committed to version control.

## Reporting vulnerabilities

Report security issues to **security@devicesdk.com**. See [SECURITY.md](https://github.com/device-sdk/devicesdk-monorepo/blob/main/SECURITY.md) for the full policy.
