---
title: devicesdk status
description: Check the connection status of devices in your project
social_image: /og-images/docs/cli/status.png
---

## Usage

```bash
devicesdk status [flags]
```

## Flags

- `--device <name>` - Show status for a specific device only
- `--project <id>` - Project ID (overrides config file)
- `--config <path>` - Path to config file (default: `devicesdk.ts`)

## Description

The `status` command shows the live connection status of all devices in your project. For each device it displays:

- **DEVICE** — the device slug
- **STATUS** — `● online`, `○ offline`, or `⚠ error` (status fetch failed)
- **VERSION** — the first 8 characters of the deployed script version ID
- **LAST SEEN** — how long ago the device last connected (or "never" if it has never connected)

Device status is read in real time from the edge — there is no caching.

## Examples

Show status of all devices in the current project:
```bash
devicesdk status
```

Show status for a specific device:
```bash
devicesdk status --device temperature-sensor
```

Show status for a project not in your config file:
```bash
devicesdk status --project my-project-id
```

## Example Output

```
Project: my-project

  DEVICE               STATUS     VERSION   LAST SEEN
  ─────────────────────────────────────────────────────
  temperature-sensor   ● online   a1b2c3d4  connected 2m ago
  humidity-sensor      ○ offline  a1b2c3d4  5h ago
  door-sensor          ○ offline  —         never
```

## Exit Codes

- `0` — success (even if all devices are offline)
- `1` — project not found, device not found, or authentication error
