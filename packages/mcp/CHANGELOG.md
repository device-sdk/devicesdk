# @devicesdk/mcp

## 0.2.3

### Patch Changes

- 874cd73: Follow-up docs cleanup: fix stale cloud-era references that survived the
  self-host pivot.
  - **Public docs (`docs/public/`)**: corrected `troubleshooting.md` (dropped
    "edge script/edge location", Cloudflare-era queues, the dead
    `status.devicesdk.com` status page, the hardcoded port-443 firewall note, and
    the request-quota framing - the server only rate-limits auth brute-force);
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
    setup - it's a Hugo + Tailwind site now, still deployed to Cloudflare Pages).
    Also pointed every "GitHub" link (the `githubUrl` param, nav/footer menus,
    footer license link, about page, terms/privacy) at the repo
    (`device-sdk/devicesdk-monorepo`) instead of the bare org root, and aligned a
    "KV namespace" → "KV store" code comment with the rest of the self-host copy.
  - **Package READMEs**: `@devicesdk/core` ("sandboxed serverless runtime" →
    in-process on the self-hosted server), `@devicesdk/cli` (`login` now needs
    `--host`), `@devicesdk/mcp` (`auth.json` → `credentials.json`).
  - **Firmware (`firmware/pico/README.md`)**: rewrote the stale "devicesdk-client"
    README (cloud backend, port 8787, personal absolute paths) and scrubbed the
    committed Wi-Fi credentials / API tokens it documented. Docs only - no
    firmware behavior change.
  - **Firmware (`firmware/esp32/`)**: rewrote the bare ESP-IDF "Hello World"
    `README.md` into a real DeviceSDK ESP32 firmware doc, rewrote the
    Pico-porting-guide `IMPLEMENTATIONS.md` into an accurate ESP32 architecture
    reference, deleted the redundant `PROJECT_SUMMARY.md` (leaked personal path +
    wrong CC0 license claim), and dropped the obsolete Cloudflare Durable-Object
    billing rationale from a `config.h` comment. Docs/comment only.

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
  - CLI: no default cloud endpoint - connect with `devicesdk login --host
http://<server>:8080` (stored in credentials) or `DEVICESDK_API_URL`.
  - Firmware: Pico gains plain `ws://` support when the host has an explicit
    port (ESP32 already had it); binaries now publish to rolling GitHub
    Releases instead of R2.
  - License: AGPL-3.0-only.

- Updated dependencies [874cd73]
- Updated dependencies [f724c46]
- Updated dependencies [3a72934]
- Updated dependencies [6d0a71b]
  - @devicesdk/cli@0.6.0

## 0.2.2

### Patch Changes

- Updated dependencies [0334095]
  - @devicesdk/cli@0.5.2

## 0.2.1

### Patch Changes

- Updated dependencies [660920d]
  - @devicesdk/cli@0.5.1

## 0.2.0

### Minor Changes

- d03b5ae: Major AI-agent-friendliness pass across the SDK so users' coding agents (Claude, Cursor, Copilot, Aider, etc.) can work in DeviceSDK projects with the right context on the first try.

  **`@devicesdk/core`** - additive only:
  - Ships `AGENTS.md` inside the npm tarball (`node_modules/@devicesdk/core/AGENTS.md`) - version-matched API guidance for agents.
  - Ships the full `docs/` folder (guides, examples) inside the tarball.
  - JSDoc with runnable `@example` blocks added to every method on `DeviceSenderInterface`. Lifecycle hooks on `DeviceEntrypoint` (`onDeviceConnect`, `onDeviceDisconnect`, `onMessage`, `onCron`) now carry block-comment JSDoc that survives into the `.d.ts`.
  - New: branded ID types (`ProjectId`, `DeviceId`, `ScriptId`, `TokenId`) plus boundary constructors (`asProjectId`, `asDeviceId`, …) for nominal-style ID safety.
  - New: `OnboardLED = 99` constant for portable LED code across Pico W, Pico 2 W, ESP32-C3, ESP32-C61.
  - New: literal pin unions in `@devicesdk/core/devices/pico` (`PicoGpioPin`, `PicoAdcPin`, `PicoPwmPin`) and a new subpath `@devicesdk/core/devices/esp32` (`Esp32GpioPin`, `Esp32C3GpioPin`, `Esp32C61GpioPin`, etc.).
  - Expanded npm `keywords` and pointed `homepage` at `/docs/`.
  - Fixed: README hello-world snippet referenced a nonexistent `this.ctx.device.log` API; now uses `console.log` and properly types `onMessage(message: DeviceResponse)`.

  **`@devicesdk/cli`** - additive only:
  - `devicesdk init` now scaffolds `AGENTS.md`, `CLAUDE.md` (one-line `@AGENTS.md`), `.cursor/rules/devicesdk.mdc`, `.mcp.json` (preconfigured for `@devicesdk/mcp`), and a project `README.md`.
  - `devicesdk init` no longer scaffolds `onMessage(message: any)` - templates use `onMessage(message: DeviceResponse)` and demonstrate inter-device RPC.
  - `devicesdk build` now emits `import type { UserWorkerEnv }` instead of the deprecated `GetEnv` alias in `devicesdk-env.d.ts`.
  - New `--json` flag on `whoami`, `status`, `logs`, `env list` (output `{success, result|error}`). `logs --tail --json` emits NDJSON. `DEVICESDK_OUTPUT=json` works as a global toggle.
  - `DeviceSDKApiError` now carries an optional `docs` URL alongside the existing `code`. `parseErrorBody` extracts both. Added `invalid_cli_token` and `missing_credentials` to the auth-expired set so the CLI surfaces the right "run `devicesdk login`" hint.
  - Help text gained "More: <docs-url>" footers.

  **`@devicesdk/mcp`** - new package:
  - `npx -y @devicesdk/mcp` runs an MCP stdio server exposing 7 tools to coding agents: `devicesdk_whoami`, `devicesdk_status`, `devicesdk_logs_tail`, `devicesdk_env_list`, `devicesdk_env_set`, `devicesdk_deploy`, `devicesdk_docs_search`.
  - Each tool wraps the equivalent `devicesdk <cmd> --json` invocation; auth is inherited from the CLI's `~/.devicesdk/auth.json`.

  **`@devicesdk/api`** - additive only:
  - `apps/api/src/foundation/auth.ts` now returns differentiated, machine-readable error codes (`missing_credentials`, `invalid_token`, `invalid_cli_token`, `account_suspended`, `account_deletion_pending`) and a `docs` URL pointing at the new `/docs/errors/<CODE>/` pages, in place of the previous catch-all `"Authentication error"` string.
  - `DeviceSender` (`apps/api/src/durableObjects/lib/deviceSender.ts`) now validates pin/range/I2C/SPI/UART/WS2812 arguments synchronously before round-tripping to firmware. Bad calls (`setGpioState(999, "high")`, `setPwmState(0, 0, 5.0)`, malformed I2C addresses, `pioWs2812Update([[256, 0, 0]])`, etc.) now throw a typed error with `code: "invalid_argument"` and a `docs` URL instead of silently returning a `command_error` event.

  **Behaviour change to note**: scripts that previously relied on `setGpioState(badPin, …)` round-tripping and surfacing as a `command_error` event in `onMessage` will now throw synchronously from the `await` site. Catch the error or fix the argument - the `docs` field on the thrown Error points at the right reference page.

  **`@devicesdk/website`** - content + agent affordances:
  - `/llms.txt` (curated index) and `/llms-full.txt` (full doc concat) now generated by Hugo. Per-page Markdown mirrors land at `<page-url>/index.md` so agents can fetch raw docs without parsing HTML.
  - New cookbook at `/docs/recipes/` with 10 task-shaped, single-page recipes (BME280, button→LED, KV counter, daily cron summary, WS2812 rainbow, OLED display, Discord webhook, HA entity, two-device RPC, watch device logs).
  - New CLI doc pages: `/docs/cli/dev/`, `/docs/cli/build/`, `/docs/cli/login/`. New guide `/docs/guides/using-i2c/`. New single-page reference `/docs/concepts/device-api/`. New error reference under `/docs/errors/`.
  - Changelog moved from `/docs/resources/changelog/` to `/docs/changelog/` (301 redirect added).
  - Fixed `/docs/concepts/architecture/` page that documented a fictional `gpio_write` message protocol - now shows the real `set_gpio_state` shape and the typed helper `setGpioState`.
  - Fixed `/docs/quickstart/` page that had two `## Step 4` headings.

### Patch Changes

- Updated dependencies [d03b5ae]
  - @devicesdk/cli@0.5.0
