---
"@devicesdk/server": patch
---

Harden the cron parser: a range or stepped range with bounds outside the
field's valid limits (e.g. `1-999999999 * * * *`) now throws immediately
instead of expanding into a multi-million-entry set, which could stall the
server event loop.
