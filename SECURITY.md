# Security Policy

## Supported versions

DeviceSDK is self-hosted software distributed as source and as a Docker image.
We support the latest released version and the `main` branch. Security updates
are released through the normal changeset + release process.

| Version | Supported |
|---|---|
| latest release | yes |
| `main` (current development) | yes |
| older releases | best effort |

## Reporting a vulnerability

If you discover a security vulnerability in DeviceSDK, please report it
privately rather than opening a public issue or pull request.

Email: **security@devicesdk.com**

Please include:

- A description of the vulnerability and the impact
- Steps to reproduce, or a proof-of-concept
- The version or commit hash where you observed the issue
- Any suggested remediation, if you have one

We aim to acknowledge reports within 72 hours and will work with you to validate
and address the issue. We will disclose fixed vulnerabilities through the
release notes and `CHANGELOG.md` once a patch is available.

## Security expectations for self-hosters

Because DeviceSDK is self-hosted, a number of security decisions are the
responsibility of the operator:

- Run the server behind an HTTPS reverse proxy in production and set
  `SECURE_COOKIES=true`.
- Set `ALLOW_REGISTRATION=false` after creating the first admin account.
- Keep the host OS, Docker, and the DeviceSDK image up to date.
- Restrict network access to the server port to trusted clients and devices.
- Protect the `DATA_DIR` volume and any backup copies of `devicesdk.sqlite`.
- Do not commit device Wi-Fi credentials, API tokens, or OAuth client secrets to
  version control.

The server does not include telemetry or phone-home behavior.
