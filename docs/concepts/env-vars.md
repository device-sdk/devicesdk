---
title: Environment Variables
description: Store secrets and configuration outside your device script source code
---

Environment variables let you store secrets — API keys, webhook URLs, credentials — at the project level and access them from device scripts at runtime. Variables are never stored in your source code or script bundles.

## Why use environment variables?

Without environment variables, secrets end up hardcoded in your source:

```typescript
// ❌ Secret in source code — visible in version history
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/YOUR_WEBHOOK_URL";
```

With environment variables:

```typescript
// ✅ Secret stored securely, not in source
const webhookUrl = await this.env.VARS.get("DISCORD_WEBHOOK_URL");
```

Benefits:
- Rotate credentials without redeploying your script
- Share a secret across multiple devices in the same project
- Keep secrets out of version control and script storage

## Managing variables with the CLI

### Set variables

```bash
# Set a single variable
devicesdk env set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Set multiple variables at once
devicesdk env set API_KEY=abc123 REGION=us-east-1

# Target a specific project
devicesdk env set API_KEY=abc123 --project my-project
```

**Key naming rules:**
- Uppercase letters, digits, and underscores only
- Must start with a letter
- Maximum 64 characters
- Examples: `API_KEY`, `WEBHOOK_URL`, `DB_PASSWORD_2`

**Value limits:**
- Maximum 4096 bytes per value (UTF-8 encoded)
- Maximum 50 variables per project

### List variables

```bash
devicesdk env list

# Output:
# KEY                   UPDATED AT
# ─────────────────────────────────────────────────
# DISCORD_WEBHOOK_URL   2024-01-15 10:23:00
# API_KEY               2024-01-10 09:00:00
```

Values are never shown in list output. Access them only from within device scripts.

### Remove a variable

```bash
devicesdk env unset DISCORD_WEBHOOK_URL
```

## Accessing variables in device scripts

Variables are available via `this.env.VARS` inside any device class:

```typescript
export class MySensor extends DeviceSender {
  async onDeviceConnect() {
    // Get a single variable
    const apiKey = await this.env.VARS.get("API_KEY");

    // Get all variables as a key-value object
    const allVars = await this.env.VARS.getAll();
  }
}
```

`get(key)` returns `string | undefined` — always check for `undefined` before using the value.

## When do changes take effect?

Environment variables are injected once when the device worker is created. Changes take effect on the **next device reconnect or reboot**.

Running `devicesdk deploy` triggers a reboot, so a deploy automatically picks up any new or updated variables.

To update variables without redeploying your script, update them with the CLI and then power-cycle your device or use `devicesdk deploy` to trigger a reboot.

## Security notes

- Variable **values are never returned** by the list API — they are only accessible inside the device runtime.
- Variables are stored at the project level; all devices in a project share the same set of variables.
- Device-level overrides (different values per device) are not supported in the current version.
