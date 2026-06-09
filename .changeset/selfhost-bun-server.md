---
"@devicesdk/server": minor
"@devicesdk/dashboard": minor
"@devicesdk/cli": minor
"@devicesdk/firmware-pico": minor
"@devicesdk/firmware-esp32": patch
"@devicesdk/website": patch
"@devicesdk/core": patch
"@devicesdk/mcp": patch
"@devicesdk/simulation": patch
---

DeviceSDK is now a self-hosted, open-source platform. The Cloudflare-hosted
backend (`apps/api`) is replaced by `@devicesdk/server`, a single Bun process
(Hono + bun:sqlite + filesystem storage) that serves the REST API, device and
watcher WebSockets, and the dashboard UI on one port, distributed as a Docker
image (amd64 + arm64).

- Server: in-process device runtime replaces Durable Objects (same watch
  protocol, command acks, connection-gated crons, per-device KV, inter-device
  RPC); local email/password accounts replace Google OAuth; usage metrics in
  SQLite replace Analytics Engine; plans/tiers/daily message limits removed.
- Dashboard: local login/registration with first-run setup; served
  same-origin by the server; cost/billing UI removed.
- CLI: no default cloud endpoint — connect with `devicesdk login --host
  http://<server>:8080` (stored in credentials) or `DEVICESDK_API_URL`.
- Firmware: Pico gains plain `ws://` support when the host has an explicit
  port (ESP32 already had it); binaries now publish to rolling GitHub
  Releases instead of R2.
- License: AGPL-3.0-only.
