---
"@devicesdk/cli": patch
---

Fix: the CLI no longer loses the stored server host (`--host`) when it
auto-refreshes an expired access token. Previously, commands run more than ~24h
after login would fall back to mDNS discovery and fail on networks without mDNS.
