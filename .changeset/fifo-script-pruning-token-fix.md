---
"@devicesdk/api": patch
---

Replace hard script version limit with FIFO auto-pruning: when a device is at its version cap, the oldest non-current versions are automatically deleted to make room for new uploads. Also exclude managed device tokens from the user API token count so device firmware tokens don't consume user token slots.
