---
title: devicesdk status
description: Show connection status and version info for devices in a project
social_image: /og-images/docs/cli/status.png
---

## Usage

```bash
devicesdk status [flags]
```

## Flags

- `--project <id>` — Project ID (defaults to `projectId` in `devicesdk.ts`)
- `--device <id>` — Show status for a specific device only
- `--config <path>` — Path to config file (default: `devicesdk.ts`)

## Description

Fetches live connection status and deployed version info for all devices in a project.
Outputs a table with one row per device.

```
Project: my-project

  DEVICE        STATUS     VERSION   LAST SEEN
  ─────────────────────────────────────────────
  temp-sensor   ● online   abc123de  connected 2m ago
  led-strip     ○ offline  f4e1c2b9  3h ago
  pump-ctrl     ○ offline  —         never
```

**Columns:**

| Column | Description |
|--------|-------------|
| DEVICE | Device ID |
| STATUS | `● online` if a WebSocket is currently open, `○ offline` otherwise |
| VERSION | First 8 characters of the deployed version ID (`—` if none deployed) |
| LAST SEEN | For online devices: how long ago the connection was established. For offline devices: how long ago they last disconnected. `never` if the device has never connected. |

If a single device's status fetch fails (e.g. a transient network error), that
row shows `✗ error fetching status` and the rest of the table is still displayed.

## Examples

Show all devices in the project configured in `devicesdk.ts`:

```bash
devicesdk status
```

Show a specific device:

```bash
devicesdk status --device temp-sensor-1
```

Use a different project:

```bash
devicesdk status --project prod-project-id
```
