---
"@devicesdk/server": patch
---

Fix first-run crash with rootful Docker Compose: switch the data volume from a
bind mount (`./data`, created root:root) to a named volume that inherits the
image's `bun:bun` ownership, and default `SECURE_COOKIES` to `false` so
dashboard login works over plain-HTTP LAN addresses.
