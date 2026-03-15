---
title: devicesdk status
description: Show live connection status for devices in a project
---

## Usage

```bash
devicesdk status [flags]
```

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --project <id>` | Project ID (overrides `devicesdk.ts`) | Read from config |
| `-d, --device <id>` | Show status for a single device only | All devices |
| `-c, --config <path>` | Path to `devicesdk.ts` config file | Auto-detected |

## Description

Shows whether each device in your project is currently connected to DeviceSDK, which script version it is running, and when it last connected.

Live connection state is queried directly from the Cloudflare Durable Object that manages each device's WebSocket connection, so it reflects the current moment — not just the last-seen timestamp stored in the database.

## Output

```
Project: my-smart-home

  DEVICE            STATUS      VERSION       LAST SEEN
  ─────────────────────────────────────────────────────
  led-controller    ● online    a1b2c3d4      connected 3m ago
  temp-sensor       ○ offline   e5f6a7b8      2 hours ago
  door-sensor       ○ offline   —             never
```

- `●` green dot — device is currently connected via WebSocket
- `○` grey dot — device is not connected
- `VERSION` — first 8 characters of the deployed script version ID, or `—` if no script has been deployed
- `LAST SEEN` — how long the device has been connected (when online), or how long ago it last connected (when offline), or `never` if the device has never connected

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Authentication failure or API error |
| `3` | No devices found in the project (or `--device` flag specifies an unknown device) |

## Examples

Show status for all devices in the project defined in `devicesdk.ts`:
```bash
devicesdk status
```

Show status for a specific device:
```bash
devicesdk status --device led-controller
```

Show status using an explicit project ID (no config file required):
```bash
devicesdk status --project my-smart-home
```

Use a custom config file path:
```bash
devicesdk status --config /path/to/devicesdk.ts
```

## Related Commands

- [devicesdk deploy](/docs/cli/deploy/) - Deploy code to connected devices
- [devicesdk flash](/docs/cli/flash/) - Flash firmware to a device
