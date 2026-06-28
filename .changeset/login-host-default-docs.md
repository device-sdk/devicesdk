---
"@devicesdk/website": patch
---

Docs: clarify that `devicesdk login` uses mDNS auto-discovery (`devicesdk.local`) by default. Drop the misleading `--host http://devicesdk.local:8080` example (pinning the default name is redundant) and reserve `--host` examples for genuinely different hosts (localhost, by IP).
