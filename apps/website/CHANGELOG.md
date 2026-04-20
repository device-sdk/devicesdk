# @devicesdk/website

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
