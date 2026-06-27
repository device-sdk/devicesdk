---
"@devicesdk/cli": patch
"@devicesdk/website": patch
---

docs: recommend `devicesdk login` without `--host` as the default path

The CLI already auto-discovers the server over mDNS, so `--host` is only needed
when mDNS is unavailable (some corporate/VPN networks), when using a custom
`MDNS_HOSTNAME`, or when the CLI runs on the same machine as the server. Updated
README, quickstart, CLI login reference, MCP docs, troubleshooting guide, error
reference, examples, and agent skills manifest to reflect this.
