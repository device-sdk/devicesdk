---
title: "devicesdk logs"
description: "View and stream log output from a deployed device"
url: http://localhost:1313/docs/cli/logs/
---

# devicesdk logs

> View and stream log output from a deployed device


# devicesdk logs

View logs from a deployed device, or continuously stream new entries as they arrive.

## Usage

```bash
devicesdk logs <project-id> <device-id> [options]
```

## Arguments

| Argument | Description |
|---|---|
| `project-id` | Your project ID |
| `device-id` | The device ID to fetch logs for |

## Options

| Option | Description |
|---|---|
| `-f, --tail` | Continuously stream new log entries (Ctrl-C to stop) |
| `-n, --lines <n>` | Number of lines to show initially (default: `50`) |
| `--level <level>` | Filter by severity: `log`, `info`, `warn`, `error`, `debug` |

## Examples

**View the last 50 log lines:**
```bash
devicesdk logs my-project my-device
```

**Stream logs in real time:**
```bash
devicesdk logs my-project my-device --tail
```

**Show only errors:**
```bash
devicesdk logs my-project my-device --level error
```

**Tail with a larger initial batch:**
```bash
devicesdk logs my-project my-device --tail --lines 100
```

## Output Format

Each log line is printed as:

```
HH:MM:SS.mmm  [LEVEL]  message
```

Log levels are color-coded when output is a terminal:

| Level | Color |
|---|---|
| `log` / `info` | Cyan |
| `warn` | Yellow |
| `error` | Red |
| `debug` | Gray |

## Tail Mode

With `--tail` / `-f`, the command polls for new log entries every 2 seconds using cursor-based pagination. This is equivalent to `heroku logs --tail` — it anchors at the current position in the log stream and prints new lines as they arrive.

Press **Ctrl-C** to stop tailing.

## Notes

- Color output is suppressed automatically when stdout is not a TTY (e.g. when piped to a file).
- In tail mode, if a network error occurs the command prints a warning and retries on the next poll cycle rather than exiting.

