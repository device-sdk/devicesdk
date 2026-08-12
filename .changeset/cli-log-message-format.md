---
"@devicesdk/cli": patch
---

`devicesdk logs` now renders console messages in human-readable form instead of showing the raw JSON array (e.g. `["hello",42]` becomes `hello 42`), matching the dashboard and docker logs output.
