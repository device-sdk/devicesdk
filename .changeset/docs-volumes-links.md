---
"@devicesdk/docs": patch
---

Fix quickstart/self-hosting/FAQ compose snippets to use a named data volume
instead of a root-owned bind mount, drop the plain-HTTP `SECURE_COOKIES=true`
from the self-hosting quick start, point the first-device examples link at the
repo's examples directory, and make the MCP agent-skills manifest link an
absolute devicesdk.com URL. The self-hosting Backups section now matches the
named-volume setup (one-off-container hot/cold backups and restore via
`bun:sqlite`'s `VACUUM INTO` instead of host `sqlite3` on a
`~/devicesdk-data` path that no example mounts).
