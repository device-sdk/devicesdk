---
"@devicesdk/cli": minor
---

Add mDNS discovery fallback when the CLI has no configured server URL.

If `DEVICESDK_API_URL`, `--host`, and stored credentials are all absent, the CLI
multicasts an mDNS A-record query for `<DEVICESDK_MDNS_HOSTNAME>.local` (default
`devicesdk.local`) and uses the first response as `http://<ip>:8080`. The
hostname and port can be overridden with `DEVICESDK_MDNS_HOSTNAME` and
`DEVICESDK_MDNS_PORT`. Covered by unit tests for the wire codec and the
discovery timeout/success paths.
