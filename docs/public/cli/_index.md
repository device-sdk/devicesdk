---
title: CLI Reference
description: Complete command-line interface reference for DeviceSDK
social_image: /og-images/docs/cli.png
---

The `devicesdk` CLI is the main way to create projects, deploy scripts, flash firmware, and inspect devices.

## Installation

Install the CLI via npm:

```bash
npm install -g @devicesdk/cli
```

Or use it directly with npx:

```bash
npx @devicesdk/cli [command]
```

## Authenticating

Run `devicesdk login --host <url>` to authenticate against your self-hosted server. Credentials are stored in `~/.devicesdk/credentials.json`.
