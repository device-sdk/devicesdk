---
"@devicesdk/cli": patch
---

Add `devicesdk logs <project-id> <device-id>` command for viewing and streaming device logs. Supports `--tail`/`-f` for real-time tailing with cursor-based polling, `--level` for severity filtering, and `--lines` to control the initial batch size.
