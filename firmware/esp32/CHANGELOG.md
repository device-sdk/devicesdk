# @devicesdk/firmware-esp32

## 0.1.0

### Minor Changes

- 60a9f49: Add mDNS service discovery so devices connect to the server without a static IP.
  - **Server**: a zero-dependency multicast-DNS responder (`apps/server/src/foundation/mdns/`,
    over `node:dgram`) advertises the server as `<MDNS_HOSTNAME>.local` (default
    `devicesdk.local`). Two new env vars: `MDNS_HOSTNAME` (rename to run several DeviceSDK
    servers on one LAN) and `MDNS_ENABLED` (default `true`). Started after the janitor and
    stopped on SIGINT/SIGTERM with a TTL-0 goodbye. Covered by the server's first `bun test`
    suite (packet codec + responder).
  - **Firmware**: ESP32 (`CONFIG_LWIP_DNS_SUPPORT_MDNS_QUERIES`) and Pico W (`LWIP_IGMP` +
    `LWIP_DNS_SUPPORT_MDNS_QUERIES`) now resolve `.local` hostnames over mDNS, so a device
    flashed with `--host http://devicesdk.local:8080` keeps reaching the server across DHCP
    lease changes. No connection-logic changes — the existing explicit-port heuristic already
    selects plain `ws://` for LAN hosts.
  - **Docs**: README, quickstart, and the `flash` CLI reference document flashing against the
    mDNS name; the roadmap marks server-side mDNS advertisement as shipped.

### Patch Changes

- 874cd73: Follow-up docs cleanup: fix stale cloud-era references that survived the
  self-host pivot.
  - **Public docs (`docs/public/`)**: corrected `troubleshooting.md` (dropped
    "edge script/edge location", Cloudflare-era queues, the dead
    `status.devicesdk.com` status page, the hardcoded port-443 firewall note, and
    the request-quota framing — the server only rate-limits auth brute-force);
    fixed `concepts/env-vars.md` (`DeviceSender` → `DeviceEntrypoint` + import),
    `guides/home-assistant.md` (`defineConfig` import from `@devicesdk/cli`, repo
    URL), `cli/init.md` (documented the real `--no-git` flag, removed the
    non-existent `--name`), `cli/deploy.md` (removed the non-existent
    `deploy --version`), `hardware/esp32-c61.md` (`devicesdk-client.bin` →
    `esp32c61-client.bin`), broken `github.com/device-sdk` org-root links, and a
    stray `</content></invoke>` artifact at the end of `resources/faq.md`. Trimmed
    the obsolete Cloudflare/Durable-Object/OAuth "Platform Roadmap" section from
    the (unpublished) `docs/public/ROADMAP.md`.
  - **Marketing site (`apps/website`)**: removed the dead cloud-billing model from
    the Solutions page ("Estimated cost / Free tier / ~$0.60/month / daily limit"
    → "Self-hosted"); fixed `export default class` hero/product code samples to
    the required named `export class`; "cloud KV" → "device KV"; rewrote the
    website `README.md` (it still described the old pure-HTML/jQuery/Wrangler
    setup — it's a Hugo + Tailwind site now, still deployed to Cloudflare Pages).
    Also pointed every "GitHub" link (the `githubUrl` param, nav/footer menus,
    footer license link, about page, terms/privacy) at the repo
    (`device-sdk/devicesdk-monorepo`) instead of the bare org root, and aligned a
    "KV namespace" → "KV store" code comment with the rest of the self-host copy.
  - **Package READMEs**: `@devicesdk/core` ("sandboxed serverless runtime" →
    in-process on the self-hosted server), `@devicesdk/cli` (`login` now needs
    `--host`), `@devicesdk/mcp` (`auth.json` → `credentials.json`).
  - **Firmware (`firmware/pico/README.md`)**: rewrote the stale "devicesdk-client"
    README (cloud backend, port 8787, personal absolute paths) and scrubbed the
    committed Wi-Fi credentials / API tokens it documented. Docs only — no
    firmware behavior change.
  - **Firmware (`firmware/esp32/`)**: rewrote the bare ESP-IDF "Hello World"
    `README.md` into a real DeviceSDK ESP32 firmware doc, rewrote the
    Pico-porting-guide `IMPLEMENTATIONS.md` into an accurate ESP32 architecture
    reference, deleted the redundant `PROJECT_SUMMARY.md` (leaked personal path +
    wrong CC0 license claim), and dropped the obsolete Cloudflare Durable-Object
    billing rationale from a `config.h` comment. Docs/comment only.

- 02b3ce3: Remove leftover Cloudflare tooling from the self-host pivot. None of these were
  reachable anymore after the move off Workers/Pages/R2; they only confused the
  build surface and a publicly-shipped author field.
  - **dashboard**: dropped the `wrangler pages deploy` script and the unused
    `wrangler` devDependency (the SPA is served by the Bun server now), and fixed
    the `author` email that still pointed at a `@cloudflare.com` address.
  - **firmware-esp32 / firmware-pico**: removed the dead `publish` scripts that
    uploaded binaries to the R2 `devicesdk-firmwares` bucket, plus the now-unused
    `wrangler` dependency. Firmware ships via rolling GitHub Releases
    (`gh release upload` in `firmware-*.yml`) and the Docker bundle.
  - **website**: deleted the stale `inputs/*.md` marketing drafts that still
    described the product as "Cloudflare-native" (Workers/Durable Objects/D1/R2).
    They predated and were superseded by the self-host content rewrite, and were
    not consumed by the Hugo build.

- 291833d: Rename all remaining `iotkit`/`IOTKIT`/`IoTKit` identifiers to `devicesdk`/`DEVICESDK`/`DeviceSDK` across firmware source, build configuration, tests, CI workflows, and documentation.
- 6d0a71b: DeviceSDK is now a self-hosted, open-source platform. The Cloudflare-hosted
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

- 6bcd71f: Switch firmware workflows from rolling releases to versioned releases.
  - `firmware-esp32.yml` and `firmware-pico.yml` now detect whether the firmware package version changed relative to the previous `main` commit and only publish a GitHub Release when bumped (or on `workflow_dispatch`).
  - Each publish creates a unique tag (`firmware-esp32@vX.Y.Z`, `firmware-pico@vX.Y.Z`) instead of recreating rolling tags, avoiding immutable-release / tag-creation rule failures.
  - The Dockerfile queries the GitHub API for the latest versioned release per firmware family and downloads from it.

## 0.0.6

### Patch Changes

- d62ba47: Boot panel now shows "Server" while the WebSocket connection is in progress and switches to "Connected" once the server connection succeeds (it previously showed "Server" at the moment of connection, which was ambiguous). On disconnect it reverts to "Server" until it reconnects. As before, the first cloud `display_update` after the `device_connected` handshake overwrites this status text — so a panel stuck on "Server" now unambiguously means the device never finished connecting to the server, while "Connected" confirms the link is up and it's waiting on the cloud's first frame.

## 0.0.5

### Patch Changes

- 3fc55a4: Fix ESP32 firmware WebSocket contract for read-back commands. `i2c_read`,
  `spi_read`, and `uart_read` parsed the wrong payload field (`length` instead of
  `bytes_to_read`), and `i2c_read` read `register` as a number instead of the
  hex-string `register_to_read` — so these commands were silently dropped on real
  hardware and the server timed out after 5s. The `i2c_read_result` and
  `i2c_scan_result` responses now emit the contract shapes (`data: string[]` /
  `addresses_found: string[]`). Bumping the firmware package triggers a new build
  and prod firmware deploy.
- 1c8a770: ESP32: detect half-open WebSocket connections and auto-reconnect. The client now
  enables protocol-level WebSocket PING/PONG (`ping_interval_sec` / `pingpong_timeout_sec`)
  plus TCP keep-alive. Previously the only keepalive was a fire-and-forget app-level
  `{"type":"ping"}` text frame the server never replies to, so a half-open TCP drop
  (home-router/NAT idle timeout, ~15 min) went unnoticed: the device kept believing it
  was connected, never reconnected, and the server's connection-gated per-device cron
  alarm stayed cancelled forever — the device showed `● online` while its cron/clock
  froze. With protocol ping/pong, a missing PONG (the runtime PONGs every PING for free
  without waking the hibernating server object) now tears the dead connection down and
  triggers auto-reconnect, which re-sends `device_connected` and re-arms the cron. The
  steady ping traffic also keeps NAT mappings warm, avoiding the idle drop in the first
  place. Closes the firmware side of the "cron stops after ~15 min while still online"
  issue for ESP32 (esp32 / esp32c3 / esp32c61); Pico's raw-lwIP client is tracked
  separately.

## 0.0.4

### Patch Changes

- f4e26bd: Cut a new firmware release for Pico and ESP32. No functional firmware changes — this entry bumps the firmware package versions so the "version packages" PR's `package.json` edits trip the path-filtered firmware workflows and rebuild/republish the binaries to R2. This release picks up the repaired R2 upload step (the `--file` path is now anchored to `$GITHUB_WORKSPACE` so `pnpm --filter … exec`'s `apps/api` CWD no longer breaks the upload).

## 0.0.3

### Patch Changes

- 48a3bf9: Cut a new firmware release for ESP32 and Pico. No functional firmware changes — this entry bumps the firmware package versions so the release pipeline rebuilds and republishes the binaries to R2. For ESP32 this picks up the fixed CI pipeline (single-job multi-target build + repaired R2 upload); the previous run built the ESP32 binaries but failed to upload them.

## 0.0.2

### Patch Changes

- 6495035: Cut a new firmware release. No functional firmware changes — this entry exists to bump the Pico and ESP32 firmware package versions so the release pipeline rebuilds and republishes the binaries.
