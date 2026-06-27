# @devicesdk/website

## 0.1.4

### Patch Changes

- e299282: Baseline community, security, and licensing cleanup:
  - Added `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md`.
  - Fixed root `README.md` tech-stack copy (website is Vue 3 + Vite SSG, not Hugo).
  - Replaced remaining `CLAUDE.md` references with `AGENTS.md` across docs and firmware readmes.
  - Updated `firmware/pico/IMPLEMENTATIONS.md` and `src/ca_cert.h` comments for the self-hosted era.
  - Added the AGPL-3.0-only license to every workspace `package.json` and copied `LICENSE` into `packages/core`, `packages/cli`, `packages/mcp`, and `packages/typescript-config`.
  - Excluded `examples/*` from the root `pnpm build` to avoid CLI-dependent example builds in the default task.
  - Removed `apps/server/openapi.json` from git, gitignored the generated file, and updated website-deploy triggers to rebuild it from server sources.
  - Hardened Docker defaults: `ALLOW_REGISTRATION=false`, `SECURE_COOKIES=true`, non-root runtime user, and a `/health` `HEALTHCHECK`.
  - Added GitHub issue/PR templates and `CODEOWNERS`.
  - Scoped Device WebSocket `versionId` lookup to the device (`device_id` filter).
  - Scoped CLI token revocation to the authenticated user (`user_id` filter).

- 2961dac: Improve docs discoverability and navigation.
  - The docs sidebar is now generated from `content.json`, so it stays in sync
    with every page under `docs/public/`.
  - Sections can be expanded/collapsed and the active section is opened
    automatically.
  - Added previous/next links at the bottom of every docs page.
  - Docs landing and section landing pages now show auto-generated card grids
    for their child pages instead of hand-curated, easy-to-stale lists.
  - Added the missing `/docs/guides/` section index.
  - Fixed broken or outdated links on the docs landing page (e.g. changelog URL).
  - Made the sidebar and table-of-contents panes scrollable on desktop.
  - Fixed mobile layout issues: docs content no longer overflows the viewport,
    tables scroll horizontally, and the mobile sidebar/TOC drawers use the
    dynamic viewport height so they fill the screen on browsers with collapsing
    toolbars.

- fbc1020: docs: quickstart and README now show the docker-compose.yml inline so users can get started without cloning the repo
- 6d9ed45: Gate website and Docker deployments on the changeset release PR merge, not on every push to main.
- 097dc34: Fix website deploy CI: install Bun before building so the server's openapi generation step succeeds.
- b8b3ced: Fix website deploy CI: use `pnpm run deploy` so pnpm invokes the package script instead of its own built-in deploy subcommand.
- 1c9f5fa: Switch website deploy from Cloudflare Pages to Workers with static assets.
- ed53ef4: Migrate the marketing website from Hugo to a Vue.js + Vite SSG stack.

  The site is now built with `vite-ssg`, renders every route to static HTML in
  `dist/`, and is deployed to Cloudflare Pages via `wrangler pages deploy`. All
  existing pages, URLs, Tailwind styling, SEO/meta tags, sitemap, `llms.txt`,
  `llms-full.txt`, per-page `index.md` mirrors, OG images, and `.well-known`
  outputs are preserved. Docs continue to be sourced from `../../docs/public/`.

- ed53ef4: Align `@devicesdk/website` changeset integration with the rest of the monorepo.
  - Fill in package metadata (`description`, `author`, `homepage`, `bugs`,
    `repository`, `keywords`) so the website package is documented the same way
    as `@devicesdk/cli`.
  - Add a dedicated "Changesets" section to `AGENTS.md` explaining public vs
    private packages and the website's changelog-only lifecycle.
  - Update `.changeset/README.md` and the feature skill to mention website
    changesets.
  - Fix `lint` and `check-types` scripts to run `build-content` first so
    `src/generated/content.json` and `src/generated/routes.ts` exist in fresh
    CI checkouts.

## 0.1.3

### Patch Changes

- ab7ea11: Critical safety and correctness fixes (Audit Batch 01).
  - **Database atomicity**: `D1CompatDatabase.batch()` now executes statements inside a synchronous `db.transaction(...)` callback, restoring atomicity for callers that rely on `c.env.DB.batch()` (entity upserts, env-var sets, CLI token refresh).
  - **Health probes**: added unauthenticated `GET /health` and `GET /ready` endpoints. `/health` returns a lightweight `{success:true,result:{status:"ok"}}`; `/ready` verifies SQLite is writable and returns 503 if not. The troubleshooting docs now reference both endpoints.
  - **Device socket replacement**: when a new connection replaces a stale one, the outgoing socket's pending commands are rejected immediately and its `connectedSeconds` usage is recorded before the replacement takes over.
  - **Process crash protection**: `server.ts` now registers `unhandledRejection` (log) and `uncaughtException` (log + `process.exit(1)`) handlers in addition to the existing `SIGTERM`/`SIGINT` shutdown logic.

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

- 87d0c04: Docs & website content pass for the self-hosted, open-source pivot. The
  marketing site, README, and the public docs (`docs/public/`) described the old
  Cloudflare-hosted, managed-runtime SaaS - they now describe running the
  DeviceSDK server yourself.
  - **Marketing site**: homepage, product, solutions, about, community, and 404
    repositioned to "free, open-source (AGPL-3.0), self-hosted." Pricing and
    Early-Access (private beta) pages removed, with 301 redirects added. Nav,
    menus, CTAs, footer, and the primary call-to-action now point at GitHub and
    the quickstart instead of a hosted dashboard sign-up. Terms and Privacy
    rewritten for self-hosted software (AGPL-3.0; no service collecting your
    data; no telemetry).
  - **Docs (`docs/public/`)**: architecture, concepts, CLI, quickstart, guides,
    recipes, resources, and errors rewritten - in-process device runtime on your
    own server (not a "globally distributed serverless runtime"), `devicesdk
login --host`, `~/.devicesdk/credentials.json`, devices on `ws://<server>:8080`,
    and honest rate-limit/scaling sections. Obsolete `account_suspended` and
    `account_deletion_pending` error pages removed (redirected). Self-host
    changelog entry added.
  - **README** rewritten around `docker compose up -d` and the self-hosted
    workflow; project-structure table updated (`apps/server` replaces `apps/api`).
  - Agent-discovery files (`llms.txt`, `llms-full.txt`, `.well-known/agent-skills`,
    `api-catalog`, `oauth-protected-resource`) updated to describe the in-process,
    self-hosted runtime.

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
    lease changes. No connection-logic changes - the existing explicit-port heuristic already
    selects plain `ws://` for LAN hosts.
  - **Docs**: README, quickstart, and the `flash` CLI reference document flashing against the
    mDNS name; the roadmap marks server-side mDNS advertisement as shipped.

- f724c46: Migrate CLAUDE.md and `.claude/skills/` to `AGENTS.md` and OpenCode-compatible `.opencode/skills/` and `.opencode/commands/`. `devicesdk init` now scaffolds `AGENTS.md` only (no longer `CLAUDE.md`), and MCP docs mention OpenCode alongside Claude and Cursor. Also hardens CI: dashboard E2E tests retry once in CI, pnpm install is retried after clearing the store, release builds have Bun available, and firmware rolling releases recreate immutable releases.
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
  - CLI: no default cloud endpoint - connect with `devicesdk login --host
http://<server>:8080` (stored in credentials) or `DEVICESDK_API_URL`.
  - Firmware: Pico gains plain `ws://` support when the host has an explicit
    port (ESP32 already had it); binaries now publish to rolling GitHub
    Releases instead of R2.
  - License: AGPL-3.0-only.

## 0.1.2

### Patch Changes

- 6495035: Add per-page Open Graph `social_image` front-matter to the docs. `generate-og.js` now points `concepts/identifiers` at its own card instead of the shared `concepts.png`, and the five `errors/*` pages each get a per-page social image.

## 0.1.1

### Patch Changes

- 7e66d0f: Infra and quality improvements (no user-visible changes):
  - **API metrics** - emit Analytics Engine data points for command RPC latency, user-script init time, and Worker Loader failures. New `ANALYTICS` binding declared in `apps/api/wrangler.jsonc` (top-level + `env.production`); thin wrapper at `apps/api/src/foundation/analytics.ts` with three event kinds (`command_rpc`, `script_init`, `loader_failure`) using `event_kind` as the index for cross-cutting queries. Safe with the binding undefined (local dev / tests no-op).
  - **`@devicesdk/core` unit tests** - add `vitest` to the package with runtime tests for `I2cDevice` and `SSD1306` (constructor defaults, the `esp32c3OledVariant` factory, pixel ops, drawing primitives, sparse encoding) and type-level guards for the `DeviceCommand` / `DeviceResponse` discriminated unions, including the `payload.mode`-discriminated `PinStateUpdate`. Wired into root `pnpm test` and `turbo run test`.
  - **Pico firmware host tests in CI** - the existing gtest suite under `firmware/pico/test/` (base64, i2c command handlers, display update, ws client) is now built and run in `.github/workflows/firmware-pico.yml`, mirroring the ESP32 pattern. The `build` job depends on `unit-tests` so a regression blocks the firmware build.
  - **Workflow consolidation** - `dashboard-tests.yml` is merged into `ci.yml` as `Component Tests` and `E2E Tests` jobs (gated on PR events, matching prior behavior). Old workflow file removed. Branch protection: required-status-check names change from `Dashboard Tests / *` to `CI / *` - update settings post-merge.
  - **PR preview deploys** - new `.github/workflows/preview-deploys.yml` publishes per-PR preview URLs for the dashboard and website using `wrangler versions upload --tag pr-N`, gated on changed paths. Each preview posts (and updates) a sticky PR comment with the URL. Website's `preview_urls` flag flipped to `true` to enable preview URL emission; production traffic still routes via the custom domain.

## 0.1.0

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

- 8cc830a: Add modern motion across all marketing pages: drifting gradient mesh in heroes, staggered scroll reveals, card-lift hover, button shimmer, animated gradient headline accent, and a live-pulse on the "Private Beta" badge. Introduces a scroll-driven assembly scene on the homepage where TypeScript editor → CLI → edge runtime → ESP32 device fly in and connect with a packet streaming along an animated WebSocket beam. All motion respects `prefers-reduced-motion`. Documents the new motion vocabulary in `apps/website/CLAUDE.md`.

  Also fixes a sticky-positioning bug: switches `overflow-x: hidden` to `overflow-x: clip` on `html`/`body`/`main` and the assembly section. `hidden` was creating a scroll container that re-scoped the inner sticky and made scenes scroll past at normal speed; `clip` preserves overflow clipping without breaking sticky.

### Patch Changes

- 7706b8e: Add trailing slash to `https://devicesdk.com/docs/api/` references in `static/.well-known/api-catalog` and `static/.well-known/oauth-protected-resource`. The site canonicalizes docs URLs with a trailing slash, so the previous values caused a 307 redirect hop for clients (and crawlers) that fetched these machine-readable metadata files.

## 0.0.5

### Patch Changes

- 71aedb1: **Manual migration required:** in every `devicesdk.ts`, rename the `entrypoint:` field to `className:`. There is no alias - `devicesdk build/dev/deploy/flash` will fail fast with a rename hint until the file is updated. Also rename `pin_state` → `pin_state_update` if you have firmware older than this release flashed to a device.

  Consolidated DX refactor - closes a half-dozen first-day pit-of-failure traps in the scaffold/build/flash flow:
  - **@devicesdk/cli (BREAKING)**: rename the device config field `entrypoint` → `className`. The old field name was misleading (it sounds like a file path; it was actually a class name). No alias - projects that still reference `entrypoint` get a clear migration error from config parse. The scaffold (`devicesdk init`) now writes `main`, `className`, `deviceType`, and `wifi` placeholders together, producing a config that validates out of the box. Wifi placeholders (`YOUR_WIFI_SSID`, `YOUR_WIFI_PASSWORD`) are rejected at config parse so you can't accidentally deploy with the scaffold defaults.
  - **@devicesdk/cli**: scaffold templates now use named exports (`export class Device extends DeviceEntrypoint`). The Worker bundler imports user classes by name; a `export default class` produced a confusing "No matching export" error at deploy time. `devicesdk build` now validates the user file's exports up front and surfaces a tailored fix-up hint when the named export is missing.
  - **@devicesdk/cli**: scaffold `tsconfig.json` no longer sets `rootDir: "./src"` - that conflicted with `include: ["devicesdk.ts"]` (a root-level file) and broke `tsc --noEmit` on a fresh project.
  - **@devicesdk/cli + @devicesdk/api**: `devicesdk flash` now surfaces a tailored error when the API has no firmware artifact published for a Zod-accepted device_type. The API returns `code: "FIRMWARE_NOT_PUBLISHED"`; the CLI prints "Firmware for X is not yet published" with a build-from-source pointer instead of a bare 404.
  - **@devicesdk/core**: `PinStateUpdate` is now a discriminated union by `payload.mode` - digital reads carry `value: "high" | "low"`, analog reads carry `value: number`. Aligns the typed contract with what firmware actually emits. Firmware (Pico + ESP32) now emits the `pin_state_update` discriminator that types and consumers (DO broadcaster, dashboard) already expected; the previous `pin_state` mismatch silently dropped state events.
  - **@devicesdk/core**: ship `SSD1306.esp32c3OledVariant()` static factory - the 72×40 0.42″ panel always needs `columnOffset: 28`. Replaces the magic-number copy/paste in the docs.
  - **@devicesdk/website**: ESP32-C3 docs use the new `SSD1306.esp32c3OledVariant()` preset and note that the prebuilt `esp32c3-client.bin` may not be promoted yet (build from source in the meantime).
  - **@devicesdk/dashboard**: dashboard temperature template narrows on `payload.mode === 'analog'` to type-check against the new `PinStateUpdate` union.

- 394d469: UX fixes batched from a new-user trial - eight small papercuts, one PR:
  - **@devicesdk/cli**: `loadConfig` / `getConfigDir` now walk up parent directories to find `devicesdk.ts`, so `deploy`, `dev`, `flash`, `logs`, `status`, `inspect`, and `env` work from any subdirectory of a project. `--config` and `DEVICESDK_CONFIG` still short-circuit the walk.
  - **@devicesdk/cli**: `devicesdk logs` accepts optional positionals - both default from `devicesdk.ts`. With one positional it's treated as the device slug (project comes from config); with two, it's `[project] [device]` as before. Multi-device projects without a positional get a friendly "pass one as positional" error listing the available device slugs.
  - **@devicesdk/cli**: 4xx response bodies are no longer dumped to stderr on every API error. Auth-revoked sessions now print one line - `Session expired - run \`devicesdk login\`.`- instead of`Response body (401): { ... }`followed by paragraph-long advice. Run with`--verbose`to keep the raw dump for debugging. The`downloadDeviceFirmware`path picks up the same treatment, so`flash` is quieter on auth/server errors.
  - **@devicesdk/cli**: `flash` permission-denied error mentions the Arch Linux `uucp` group (not just Debian's `dialout`) and links to the docs page that ships a persistent `99-devicesdk-serial.rules` snippet.
  - **@devicesdk/api**: the device runtime no longer prepends `[<projectId>:<deviceId>]` to every `console.log/info/warn/error/debug` call. Persisted log entries were already prefix-free; this drops the redundant tag from Wrangler tail / runtime stdout. Devices already carry their identity via the watcher URL.
  - **@devicesdk/simulation**: when the local dev server restarts after a file edit, the simulator UI now auto-reconnects with exponential backoff (1 s → 30 s) and shows a "Local server restarted - reconnecting…" banner instead of silently going dead until the user refreshes the browser.
  - **@devicesdk/website**: new `concepts/identifiers` page explains project slug vs device slug vs the underlying UUIDs in one place. The CLI reference index now points at it. The `flash` page documents serial-port permissions for both Debian-style (`dialout`) and Arch (`uucp`) systems, ships a copy-pasteable `99-devicesdk-serial.rules` udev snippet for CP210x / CH340 / FTDI bridges, and adds a "Verify connectivity" subsection pointing at `devicesdk status` after the LED sequence. The pin-read example on the first-device page is now a complete copy-pasteable snippet showing how to discriminate digital vs analog reads.

## 0.0.4

### Patch Changes

- fd6e829: ESP32-C3 0.42″ OLED ergonomics + local-dev fixes:
  - **firmware/esp32**: paint boot status (`Booting` → `WiFi` → `Server`) on the on-board OLED for FN4 / "0.42 OLED" boards. The firmware probes `0x3C` at boot via `i2c_master_probe`; boards without an OLED (DevKitM-1) get a fast NACK and silently skip. Replaces the WS2812-only feedback that was invisible on FN4 boards (no LED wired to GPIO 8).
  - **firmware/esp32**: detect plain-HTTP local API hosts (`<lan-ip>:<port>`) and dial `ws://` instead of `wss://`, so flashing against `localhost:8787` works without a TLS cert.
  - **@devicesdk/api**: throw an explicit error from the `/v1/auth/google` route when `GOOGLE_ID`/`GOOGLE_SECRET` are missing - Sentry captures the misconfiguration cleanly instead of returning a generic chanfana validation error.
  - **@devicesdk/core**: update `columnOffset` comments to point at `28` (most common on FN4 0.42″ boards) and note `30`/`32` variants exist.
  - **@devicesdk/website**: document `columnOffset: 28` for the 0.42″ 72×40 panel and add a troubleshooting note for the leftmost vertical-stripe artifact (panel-offset mismatch / stale RAM).

- c19ce77: Logs-quota runaway fix + layered rate-limit defense:
  - **@devicesdk/api (breaking)**: deprecate `GET /v1/projects/:projectId/devices/:deviceId/logs` - the endpoint now returns `410 Gone` with `Link: …/watch>; rel="alternate"` and `code: "LOGS_DEPRECATED"`. The corresponding DO RPC `BaseDevice.getLogs` throws on call. A stale CLI `--tail` polling loop in May 2026 burned the daily Durable Object rows-read free-tier quota in ~5 hours each day; the polling pattern is now structurally impossible.
  - **@devicesdk/api**: watcher WebSocket (`/watch`) gains `?backfillLimit=N&backfillLevel=warn` query parameters. On connect the server emits up to N replay frames (`{ event: "log", data, replay: true }`, oldest-first) followed by a single `{ event: "history_complete" }` marker, then live broadcasts as before. One SQL scan per connection instead of per HTTP poll.
  - **@devicesdk/api**: add `TieredCache` (`caches.default` L1 → KV L2 with back-fill) and a single `CACHE` KV namespace. Two consumers: `userBlockListMiddleware` (mounted post-auth - 429s blocked users at the edge of the worker without touching D1 or the DO) and `authCache.ts` (caches `authenticateUser` lookups for 60 s, dropping ~95% of D1 reads per request on active tokens). Logout / onboarding completion / account-deletion request all invalidate the entry.
  - **@devicesdk/api**: when the per-user rate limit fires, also write a 1-hour cross-route block to `CACHE` so subsequent requests 429 immediately. Per-user rate limit is now scoped to `/logs` only (other routes are protected by tier limits inside their handlers and the WAF rule below).
  - **@devicesdk/cli (breaking)**: `devicesdk logs` and `devicesdk logs --tail` now use the watcher WebSocket exclusively. Both modes accept `--lines` and `--level`; the polling loop is gone. `--tail` reconnects with exponential backoff (1 s → 30 s) and bails with a non-zero exit code after 5 consecutive failures.
  - **@devicesdk/dashboard**: device logs panel migrates to WS-only. `useDeviceStream` accepts `{ backfillLimit, backfillLevel }` and exposes a `historyLoaded` ref; the panel shows a "Loading recent logs…" spinner until `history_complete` fires. The "Live" toggle and "Load More" button are removed - backfill + live are one stream.
  - **@devicesdk/website**: documents the manual Cloudflare WAF rate-limit rule under `docs/internal/operations/cloudflare-waf.md` and the new auth-cache / block-list architecture in CLAUDE.md.

  **Manual deploy steps** (also in the PR description):
  1. KV namespace IDs are already in `apps/api/wrangler.jsonc` (created in this branch).
  2. Apply the WAF rule per `docs/internal/operations/cloudflare-waf.md`.

- 17ad113: SEO baseline fixes for devicesdk.com, driven by a Search Console audit showing only 13/21 known URLs indexed and a brand-only impression profile (95 imp/qtr on "device sdk" with 2.1% CTR at avg position 7.4):
  - **head.html**: emit `<link rel="canonical">` on every page, branch `og:type` between `website` (home + section landings) and `article` (docs + legal). Add `og:site_name`, `og:locale`, and `twitter:site` for SERP/social attribution. Combine Organization + WebSite JSON-LD under `@graph` on the home page; add BreadcrumbList JSON-LD on `/docs/*` pages with depth ≥ 2; add TechArticle JSON-LD on `/docs/*` single pages with `datePublished`/`dateModified` pulled from git so docs qualify for the visual Article rich snippet.
  - **hugo.toml**: enable `enableGitInfo` and add a `[sitemap]` block so the generated sitemap carries `<lastmod>` derived from git commit dates (45 lastmod entries vs. 0 before). Add `[frontmatter]` resolution chain so `.Date` and `.Lastmod` fall back to `:git` when no front-matter dates are set. Retitle the home and replace the site-wide description so the SERP snippet leads with the verb and the hardware names searchers care about ("Deploy TypeScript to ESP32 & Raspberry Pi Pico").
  - **`static/_redirects`** (new): 301 the stale `/docs/resources/hardware/*` URLs to `/docs/hardware/*` (Google was wasting ~36 imp/qtr on the old path), the deleted `/docs/guides/control-from-browser/`, and `/docs` → `/docs/`.
  - **CLAUDE.md + new `.claude/skills/website-url-changes/SKILL.md`**: codify a "URL change → 301 redirect" rule so future content moves don't re-create the same SEO debt. The skill auto-triggers on any rename/move/delete under `apps/website/content/` or `docs/public/`, or any `permalink`/`url`/`[permalinks]`/`[[module.mounts]]` edit that shifts URLs.

  Sitemap re-submission in Search Console (HTTP → HTTPS), validation of "Duplicate without canonical" and "Not found (404)" rows, and a "Request indexing" of the home page are manual GSC follow-ups not covered here.

## 0.0.3

### Patch Changes

- 770f48d: Publish agent-readiness metadata: `/.well-known/oauth-protected-resource` (RFC 9728) describing the API's bearer-token auth surface, an `oauth-protected-resource` Link header and api-catalog entry so agents can discover it, and a WebMCP `search_docs` tool (via `navigator.modelContext.provideContext`) that proxies to the existing docs AI-Search MCP instance.

  OIDC discovery and an OAuth authorization-server metadata document are deliberately not published - DeviceSDK does not operate an OAuth authorization server, so advertising one would mislead agents.

## 0.0.2

### Patch Changes

- 186e722: Fix `/robots.txt` serving the Hugo-default `User-agent: *` line instead of the full policy file.

  Root cause: `enableRobotsTXT = true` in `hugo.toml` made Hugo generate its built-in 14-byte default `robots.txt`, which on CI ended up winning over `apps/website/static/robots.txt` (282 bytes) in the final output. Setting `enableRobotsTXT = false` stops Hugo from touching `robots.txt`, so the static file is the only candidate.

## 0.0.1

### Patch Changes

- 769f12d: Swap the DeviceSDK logo to the new chip-braces mark (DIP silhouette with `{ }` braces on the die). Three coordinated SVG variants from the brand package are now wired up:
  - **Containerized favicon** (rounded-black square w/ white chip) - serves `apps/website/static/logo.svg` (browser tab, `/api/docs` favicon, OG card source) and `apps/dashboard/public/favicon.svg` (browser tab, in-app header, drawer, login page).
  - **Inverse mark** (white chip, transparent bg) - serves `apps/website/assets/logo.svg`, rendered in the website's dark navbar and footer.
  - **Primary mark** - stored at `.brand/` alongside the full brand spec HTML for future use.

  Also:
  - Inline the OG-card logo SVG directly in `apps/website/generate-og.js` so social-card regeneration no longer fetches `https://devicesdk.com/logo.svg` at build time.
  - Delete 46 stale pre-rendered OG PNGs under `apps/website/static/og-images/` - they regenerate on the next `pnpm build --filter @devicesdk/website` with the new mark.
  - Remove the dead lightning-bolt fallback branch in the website `header.html` / `footer.html` Hugo partials; the logo resource has existed for some time.

- e53d79f: Add ESP32-C3 as a supported device type.
  - Firmware: new `sdkconfig.defaults.esp32c3` (WS2812 on GPIO 8); `Kconfig.projbuild` defaults addressable LED on for the C3 target; `hal.c` branches on `SOC_RMT_SUPPORTED` and uses the RMT backend for led_strip on C3 (C61 keeps the SPI backend).
  - Build & CI: `firmware/esp32/package.json` `build:all` + `publish` now emit and upload `esp32c3-client.bin`. The `firmware-esp32` GitHub workflow is converted to a target matrix (`esp32`, `esp32c61`, `esp32c3`) with per-target R2 uploads on main.
  - API: `POST /v1/projects/:p/devices/:d/firmware` accepts `device_type: "esp32c3"`. The ESP branch now uses `startsWith("esp32")` to route any ESP variant to `<target>-client.bin`.
  - CLI: `DeviceType` gains `"esp32c3"`; `isEsp32DeviceType` simplified to `startsWith("esp32")`; `getEsp32ChipName` returns `"esp32c3"` for the new target, and `devicesdk flash` routes C3 devices to `flashESP32` with `--chip esp32c3`. Tests cover the new device type in `config.test.ts` and `flash.test.ts`.

- f1aa0ee: Split the combined Hardware Compatibility page into one page per board and promote Hardware to a top-level docs section.
  - New URLs: `/docs/hardware/` (hub with cross-board feature matrix), `/docs/hardware/pico-w/`, `/docs/hardware/pico-2w/`, `/docs/hardware/esp32/`, `/docs/hardware/esp32-c3/`, `/docs/hardware/esp32-c61/`.
  - The old `/docs/resources/hardware/` URL now meta-refreshes to `/docs/hardware/` (Hugo alias) so external links keep working.
  - Adds a dedicated ESP32-C3 page - previously the board was supported in firmware but had no documentation entry.
  - Sidebar on docs pages now shows Hardware as its own section with six links (Overview + 5 boards); the Hardware Compatibility entry moves out of Resources.
  - Cross-page links in `/docs/cli/flash/`, the SPI/UART/addressable-LED guides, and the docs index updated to the new URL.

- b1794b5: Move the interactive API reference from `/api/docs` to `/docs/api` (Swagger UI + `openapi.json`). The old URL is no longer served.

  Add agent-discovery metadata on the marketing site:
  - `Link` response headers on `/` (RFC 8288) pointing to `api-catalog`, `service-desc` (OpenAPI schema), and `service-doc` (Swagger UI).
  - New `/.well-known/api-catalog` resource (RFC 9727) served as `application/linkset+json`, listing the REST API's OpenAPI schema and documentation URLs.

  Implemented via a static `apps/website/static/_headers` file (honored by Cloudflare Workers Assets) and a static linkset JSON at `apps/website/static/.well-known/api-catalog`.

  Also collapse `robots.txt` to a single wildcard `User-agent: *` group with a `Content-Signal: ai-train=yes, search=yes, ai-input=yes` line, replacing the per-bot enumeration. Stance is unchanged - fully open to every crawler, AI included.

  Stop rendering `/docs/roadmap/` on the public site. The `docs/ROADMAP.md` source file stays in the repo for internal reference but is excluded from the build via Hugo's `build.render: never` frontmatter.
