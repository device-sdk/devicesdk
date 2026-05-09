# @devicesdk/website

## 0.0.5

### Patch Changes

- 71aedb1: **Manual migration required:** in every `devicesdk.ts`, rename the `entrypoint:` field to `className:`. There is no alias — `devicesdk build/dev/deploy/flash` will fail fast with a rename hint until the file is updated. Also rename `pin_state` → `pin_state_update` if you have firmware older than this release flashed to a device.

  Consolidated DX refactor — closes a half-dozen first-day pit-of-failure traps in the scaffold/build/flash flow:
  - **@devicesdk/cli (BREAKING)**: rename the device config field `entrypoint` → `className`. The old field name was misleading (it sounds like a file path; it was actually a class name). No alias — projects that still reference `entrypoint` get a clear migration error from config parse. The scaffold (`devicesdk init`) now writes `main`, `className`, `deviceType`, and `wifi` placeholders together, producing a config that validates out of the box. Wifi placeholders (`YOUR_WIFI_SSID`, `YOUR_WIFI_PASSWORD`) are rejected at config parse so you can't accidentally deploy with the scaffold defaults.
  - **@devicesdk/cli**: scaffold templates now use named exports (`export class Device extends DeviceEntrypoint`). The Worker bundler imports user classes by name; a `export default class` produced a confusing "No matching export" error at deploy time. `devicesdk build` now validates the user file's exports up front and surfaces a tailored fix-up hint when the named export is missing.
  - **@devicesdk/cli**: scaffold `tsconfig.json` no longer sets `rootDir: "./src"` — that conflicted with `include: ["devicesdk.ts"]` (a root-level file) and broke `tsc --noEmit` on a fresh project.
  - **@devicesdk/cli + @devicesdk/api**: `devicesdk flash` now surfaces a tailored error when the API has no firmware artifact published for a Zod-accepted device_type. The API returns `code: "FIRMWARE_NOT_PUBLISHED"`; the CLI prints "Firmware for X is not yet published" with a build-from-source pointer instead of a bare 404.
  - **@devicesdk/core**: `PinStateUpdate` is now a discriminated union by `payload.mode` — digital reads carry `value: "high" | "low"`, analog reads carry `value: number`. Aligns the typed contract with what firmware actually emits. Firmware (Pico + ESP32) now emits the `pin_state_update` discriminator that types and consumers (DO broadcaster, dashboard) already expected; the previous `pin_state` mismatch silently dropped state events.
  - **@devicesdk/core**: ship `SSD1306.esp32c3OledVariant()` static factory — the 72×40 0.42″ panel always needs `columnOffset: 28`. Replaces the magic-number copy/paste in the docs.
  - **@devicesdk/website**: ESP32-C3 docs use the new `SSD1306.esp32c3OledVariant()` preset and note that the prebuilt `esp32c3-client.bin` may not be promoted yet (build from source in the meantime).
  - **@devicesdk/dashboard**: dashboard temperature template narrows on `payload.mode === 'analog'` to type-check against the new `PinStateUpdate` union.

- 394d469: UX fixes batched from a new-user trial — eight small papercuts, one PR:
  - **@devicesdk/cli**: `loadConfig` / `getConfigDir` now walk up parent directories to find `devicesdk.ts`, so `deploy`, `dev`, `flash`, `logs`, `status`, `inspect`, and `env` work from any subdirectory of a project. `--config` and `DEVICESDK_CONFIG` still short-circuit the walk.
  - **@devicesdk/cli**: `devicesdk logs` accepts optional positionals — both default from `devicesdk.ts`. With one positional it's treated as the device slug (project comes from config); with two, it's `[project] [device]` as before. Multi-device projects without a positional get a friendly "pass one as positional" error listing the available device slugs.
  - **@devicesdk/cli**: 4xx response bodies are no longer dumped to stderr on every API error. Auth-revoked sessions now print one line — `Session expired — run \`devicesdk login\`.`— instead of`Response body (401): { ... }`followed by paragraph-long advice. Run with`--verbose`to keep the raw dump for debugging. The`downloadDeviceFirmware`path picks up the same treatment, so`flash` is quieter on auth/server errors.
  - **@devicesdk/cli**: `flash` permission-denied error mentions the Arch Linux `uucp` group (not just Debian's `dialout`) and links to the docs page that ships a persistent `99-devicesdk-serial.rules` snippet.
  - **@devicesdk/api**: the device runtime no longer prepends `[<projectId>:<deviceId>]` to every `console.log/info/warn/error/debug` call. Persisted log entries were already prefix-free; this drops the redundant tag from Wrangler tail / runtime stdout. Devices already carry their identity via the watcher URL.
  - **@devicesdk/simulation**: when the local dev server restarts after a file edit, the simulator UI now auto-reconnects with exponential backoff (1 s → 30 s) and shows a "Local server restarted — reconnecting…" banner instead of silently going dead until the user refreshes the browser.
  - **@devicesdk/website**: new `concepts/identifiers` page explains project slug vs device slug vs the underlying UUIDs in one place. The CLI reference index now points at it. The `flash` page documents serial-port permissions for both Debian-style (`dialout`) and Arch (`uucp`) systems, ships a copy-pasteable `99-devicesdk-serial.rules` udev snippet for CP210x / CH340 / FTDI bridges, and adds a "Verify connectivity" subsection pointing at `devicesdk status` after the LED sequence. The pin-read example on the first-device page is now a complete copy-pasteable snippet showing how to discriminate digital vs analog reads.

## 0.0.4

### Patch Changes

- fd6e829: ESP32-C3 0.42″ OLED ergonomics + local-dev fixes:
  - **firmware/esp32**: paint boot status (`Booting` → `WiFi` → `Server`) on the on-board OLED for FN4 / "0.42 OLED" boards. The firmware probes `0x3C` at boot via `i2c_master_probe`; boards without an OLED (DevKitM-1) get a fast NACK and silently skip. Replaces the WS2812-only feedback that was invisible on FN4 boards (no LED wired to GPIO 8).
  - **firmware/esp32**: detect plain-HTTP local API hosts (`<lan-ip>:<port>`) and dial `ws://` instead of `wss://`, so flashing against `localhost:8787` works without a TLS cert.
  - **@devicesdk/api**: throw an explicit error from the `/v1/auth/google` route when `GOOGLE_ID`/`GOOGLE_SECRET` are missing — Sentry captures the misconfiguration cleanly instead of returning a generic chanfana validation error.
  - **@devicesdk/core**: update `columnOffset` comments to point at `28` (most common on FN4 0.42″ boards) and note `30`/`32` variants exist.
  - **@devicesdk/website**: document `columnOffset: 28` for the 0.42″ 72×40 panel and add a troubleshooting note for the leftmost vertical-stripe artifact (panel-offset mismatch / stale RAM).

- c19ce77: Logs-quota runaway fix + layered rate-limit defense:
  - **@devicesdk/api (breaking)**: deprecate `GET /v1/projects/:projectId/devices/:deviceId/logs` — the endpoint now returns `410 Gone` with `Link: …/watch>; rel="alternate"` and `code: "LOGS_DEPRECATED"`. The corresponding DO RPC `BaseDevice.getLogs` throws on call. A stale CLI `--tail` polling loop in May 2026 burned the daily Durable Object rows-read free-tier quota in ~5 hours each day; the polling pattern is now structurally impossible.
  - **@devicesdk/api**: watcher WebSocket (`/watch`) gains `?backfillLimit=N&backfillLevel=warn` query parameters. On connect the server emits up to N replay frames (`{ event: "log", data, replay: true }`, oldest-first) followed by a single `{ event: "history_complete" }` marker, then live broadcasts as before. One SQL scan per connection instead of per HTTP poll.
  - **@devicesdk/api**: add `TieredCache` (`caches.default` L1 → KV L2 with back-fill) and a single `CACHE` KV namespace. Two consumers: `userBlockListMiddleware` (mounted post-auth — 429s blocked users at the edge of the worker without touching D1 or the DO) and `authCache.ts` (caches `authenticateUser` lookups for 60 s, dropping ~95% of D1 reads per request on active tokens). Logout / onboarding completion / account-deletion request all invalidate the entry.
  - **@devicesdk/api**: when the per-user rate limit fires, also write a 1-hour cross-route block to `CACHE` so subsequent requests 429 immediately. Per-user rate limit is now scoped to `/logs` only (other routes are protected by tier limits inside their handlers and the WAF rule below).
  - **@devicesdk/cli (breaking)**: `devicesdk logs` and `devicesdk logs --tail` now use the watcher WebSocket exclusively. Both modes accept `--lines` and `--level`; the polling loop is gone. `--tail` reconnects with exponential backoff (1 s → 30 s) and bails with a non-zero exit code after 5 consecutive failures.
  - **@devicesdk/dashboard**: device logs panel migrates to WS-only. `useDeviceStream` accepts `{ backfillLimit, backfillLevel }` and exposes a `historyLoaded` ref; the panel shows a "Loading recent logs…" spinner until `history_complete` fires. The "Live" toggle and "Load More" button are removed — backfill + live are one stream.
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

  OIDC discovery and an OAuth authorization-server metadata document are deliberately not published — DeviceSDK does not operate an OAuth authorization server, so advertising one would mislead agents.

## 0.0.2

### Patch Changes

- 186e722: Fix `/robots.txt` serving the Hugo-default `User-agent: *` line instead of the full policy file.

  Root cause: `enableRobotsTXT = true` in `hugo.toml` made Hugo generate its built-in 14-byte default `robots.txt`, which on CI ended up winning over `apps/website/static/robots.txt` (282 bytes) in the final output. Setting `enableRobotsTXT = false` stops Hugo from touching `robots.txt`, so the static file is the only candidate.

## 0.0.1

### Patch Changes

- 769f12d: Swap the DeviceSDK logo to the new chip-braces mark (DIP silhouette with `{ }` braces on the die). Three coordinated SVG variants from the brand package are now wired up:
  - **Containerized favicon** (rounded-black square w/ white chip) — serves `apps/website/static/logo.svg` (browser tab, `/api/docs` favicon, OG card source) and `apps/dashboard/public/favicon.svg` (browser tab, in-app header, drawer, login page).
  - **Inverse mark** (white chip, transparent bg) — serves `apps/website/assets/logo.svg`, rendered in the website's dark navbar and footer.
  - **Primary mark** — stored at `.brand/` alongside the full brand spec HTML for future use.

  Also:
  - Inline the OG-card logo SVG directly in `apps/website/generate-og.js` so social-card regeneration no longer fetches `https://devicesdk.com/logo.svg` at build time.
  - Delete 46 stale pre-rendered OG PNGs under `apps/website/static/og-images/` — they regenerate on the next `pnpm build --filter @devicesdk/website` with the new mark.
  - Remove the dead lightning-bolt fallback branch in the website `header.html` / `footer.html` Hugo partials; the logo resource has existed for some time.

- e53d79f: Add ESP32-C3 as a supported device type.
  - Firmware: new `sdkconfig.defaults.esp32c3` (WS2812 on GPIO 8); `Kconfig.projbuild` defaults addressable LED on for the C3 target; `hal.c` branches on `SOC_RMT_SUPPORTED` and uses the RMT backend for led_strip on C3 (C61 keeps the SPI backend).
  - Build & CI: `firmware/esp32/package.json` `build:all` + `publish` now emit and upload `esp32c3-client.bin`. The `firmware-esp32` GitHub workflow is converted to a target matrix (`esp32`, `esp32c61`, `esp32c3`) with per-target R2 uploads on main.
  - API: `POST /v1/projects/:p/devices/:d/firmware` accepts `device_type: "esp32c3"`. The ESP branch now uses `startsWith("esp32")` to route any ESP variant to `<target>-client.bin`.
  - CLI: `DeviceType` gains `"esp32c3"`; `isEsp32DeviceType` simplified to `startsWith("esp32")`; `getEsp32ChipName` returns `"esp32c3"` for the new target, and `devicesdk flash` routes C3 devices to `flashESP32` with `--chip esp32c3`. Tests cover the new device type in `config.test.ts` and `flash.test.ts`.

- f1aa0ee: Split the combined Hardware Compatibility page into one page per board and promote Hardware to a top-level docs section.
  - New URLs: `/docs/hardware/` (hub with cross-board feature matrix), `/docs/hardware/pico-w/`, `/docs/hardware/pico-2w/`, `/docs/hardware/esp32/`, `/docs/hardware/esp32-c3/`, `/docs/hardware/esp32-c61/`.
  - The old `/docs/resources/hardware/` URL now meta-refreshes to `/docs/hardware/` (Hugo alias) so external links keep working.
  - Adds a dedicated ESP32-C3 page — previously the board was supported in firmware but had no documentation entry.
  - Sidebar on docs pages now shows Hardware as its own section with six links (Overview + 5 boards); the Hardware Compatibility entry moves out of Resources.
  - Cross-page links in `/docs/cli/flash/`, the SPI/UART/addressable-LED guides, and the docs index updated to the new URL.

- b1794b5: Move the interactive API reference from `/api/docs` to `/docs/api` (Swagger UI + `openapi.json`). The old URL is no longer served.

  Add agent-discovery metadata on the marketing site:
  - `Link` response headers on `/` (RFC 8288) pointing to `api-catalog`, `service-desc` (OpenAPI schema), and `service-doc` (Swagger UI).
  - New `/.well-known/api-catalog` resource (RFC 9727) served as `application/linkset+json`, listing the REST API's OpenAPI schema and documentation URLs.

  Implemented via a static `apps/website/static/_headers` file (honored by Cloudflare Workers Assets) and a static linkset JSON at `apps/website/static/.well-known/api-catalog`.

  Also collapse `robots.txt` to a single wildcard `User-agent: *` group with a `Content-Signal: ai-train=yes, search=yes, ai-input=yes` line, replacing the per-bot enumeration. Stance is unchanged — fully open to every crawler, AI included.

  Stop rendering `/docs/roadmap/` on the public site. The `docs/ROADMAP.md` source file stays in the repo for internal reference but is excluded from the build via Hugo's `build.render: never` frontmatter.
