# @devicesdk/firmware-pico

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
- 6bcd71f: Switch firmware workflows from rolling releases to versioned releases.
  - `firmware-esp32.yml` and `firmware-pico.yml` now detect whether the firmware package version changed relative to the previous `main` commit and only publish a GitHub Release when bumped (or on `workflow_dispatch`).
  - Each publish creates a unique tag (`firmware-esp32@vX.Y.Z`, `firmware-pico@vX.Y.Z`) instead of recreating rolling tags, avoiding immutable-release / tag-creation rule failures.
  - The Dockerfile queries the GitHub API for the latest versioned release per firmware family and downloads from it.

## 0.0.5

### Patch Changes

- d1d32e2: Fix Pico firmware WebSocket memory-safety bugs and read-back command contract.

  Memory safety (`lib/lwip_ws/ws_client.cpp`): `build_frame` now emits the 16-bit
  extended length, so frames ≥126 bytes (nearly every `command_ack`, which carries
  the server's 36-char id) are no longer silently dropped; the TCP error callback
  no longer calls `altcp_close()` on the already-freed pcb (use-after-free on
  RST/drop/reboot); and the rx loop no longer erases past the buffer end after a
  Close frame (including the rate-limit close). `handle_spi_transfer` guards the
  copy into the 256-byte response buffer.

  Contract: the production inline path now reads `bytes_to_read` (not `length`) and
  the hex-string `register_to_read` (not numeric `register`) for `i2c_read` /
  `spi_read` / `uart_read`, and `i2c_scan_result` / `i2c_read_result` emit the
  contract shapes (`addresses_found` / hex-string `data` arrays). Bumping the
  firmware package triggers a new build and prod firmware deploy.

## 0.0.4

### Patch Changes

- f4e26bd: Cut a new firmware release for Pico and ESP32. No functional firmware changes — this entry bumps the firmware package versions so the "version packages" PR's `package.json` edits trip the path-filtered firmware workflows and rebuild/republish the binaries to R2. This release picks up the repaired R2 upload step (the `--file` path is now anchored to `$GITHUB_WORKSPACE` so `pnpm --filter … exec`'s `apps/api` CWD no longer breaks the upload).

## 0.0.3

### Patch Changes

- 48a3bf9: Cut a new firmware release for ESP32 and Pico. No functional firmware changes — this entry bumps the firmware package versions so the release pipeline rebuilds and republishes the binaries to R2. For ESP32 this picks up the fixed CI pipeline (single-job multi-target build + repaired R2 upload); the previous run built the ESP32 binaries but failed to upload them.

## 0.0.2

### Patch Changes

- 6495035: Cut a new firmware release. No functional firmware changes — this entry exists to bump the Pico and ESP32 firmware package versions so the release pipeline rebuilds and republishes the binaries.
