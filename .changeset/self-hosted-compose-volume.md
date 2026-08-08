---
"@devicesdk/server": patch
---

Fix first-run crash with rootful Docker Compose: switch the data volume from a
bind mount (`./data`, created root:root) to a named volume that inherits the
image's `bun:bun` ownership, and default `SECURE_COOKIES` to `false` so
dashboard login works over plain-HTTP LAN addresses. The Docker build now
retries firmware release fetches and fails loudly instead of shipping an image
with zero firmware binaries when no release tag exists.
