# @devicesdk/dashboard

## 0.1.3

### Patch Changes

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

- 7357c22: Upgrade `vitest` 3.2.4 → 4.1.5 and `@cloudflare/vitest-pool-workers` 0.11.1 → 0.15.2 across the monorepo:
  - **`apps/api/tests/vitest.config.mts`** rewrite for the new pool-workers shape: imports `defineConfig` from `vitest/config` and the `cloudflareTest` Vite plugin from `@cloudflare/vitest-pool-workers` (the `/config` subpath was removed, and `defineWorkersConfig` no longer exists). The wrangler `configPath` is now resolved relative to the project root, so it's passed as an absolute path. Test miniflare `compatibilityDate` synced to `2026-04-24` to match `wrangler.jsonc`.
  - **Test isolation regression** caused by removal of `isolatedStorage`: D1/KV/Cache writes now persist between `it()` blocks within a file. Added per-suite cleanup in `tokens.test.ts`, `scripts.test.ts` (with the inner `beforeAll` script-upload blocks converted to `beforeEach` so they re-seed after the wipe), and `devices.test.ts`. `blockList.test.ts` and `rateLimitBlock.test.ts` now also purge the matching `caches.default` Request after deleting from KV — `TieredCache` writes to both layers, and L1 staleness was tripping the path-scoped middleware test.
  - **`packages/cli/src/commands/logs.test.ts`**: vitest 4 rejects arrow-function implementations passed to `vi.fn()` when the mock is invoked with `new`. The `ws` mock now references a top-level `function` declaration (which biome leaves untouched) instead of an inline arrow.
  - **`apps/dashboard/package.json`**: `vitest` aligned to the workspace catalog so all three test-using packages share one version.
  - **catalog bumps** in `pnpm-workspace.yaml`: `vitest`/`@vitest/runner`/`@vitest/coverage-istanbul`/`@vitest/snapshot` → `^4.1.5`, `wrangler` → `^4.87.0`. `@cloudflare/workers-types` → `^4.20260501.1` in `apps/api`.

  No production-runtime behavior changes; this is dev-tooling only.

## 0.1.2

### Patch Changes

- 769f12d: Swap the DeviceSDK logo to the new chip-braces mark (DIP silhouette with `{ }` braces on the die). Three coordinated SVG variants from the brand package are now wired up:
  - **Containerized favicon** (rounded-black square w/ white chip) — serves `apps/website/static/logo.svg` (browser tab, `/api/docs` favicon, OG card source) and `apps/dashboard/public/favicon.svg` (browser tab, in-app header, drawer, login page).
  - **Inverse mark** (white chip, transparent bg) — serves `apps/website/assets/logo.svg`, rendered in the website's dark navbar and footer.
  - **Primary mark** — stored at `.brand/` alongside the full brand spec HTML for future use.

  Also:
  - Inline the OG-card logo SVG directly in `apps/website/generate-og.js` so social-card regeneration no longer fetches `https://devicesdk.com/logo.svg` at build time.
  - Delete 46 stale pre-rendered OG PNGs under `apps/website/static/og-images/` — they regenerate on the next `pnpm build --filter @devicesdk/website` with the new mark.
  - Remove the dead lightning-bolt fallback branch in the website `header.html` / `footer.html` Hugo partials; the logo resource has existed for some time.

## 0.1.1

### Patch Changes

- fe1bad8: Replace stub script templates in the dashboard with working examples covering blink, temperature monitoring, I2C sensor reading, PWM motor control, button LED toggle, and GPIO input monitoring.

## 0.1.0

### Minor Changes

- bc3493a: Add device logging pipeline: console.log/info/warn/error/debug in user device scripts are automatically captured, persisted to per-device storage, served via GET /v1/.../logs endpoint, and displayed in dashboard Logs tab.

  Breaking: removed `LoggerInterface` and `LOGGER` from `UserWorkerEnv` in `@devicesdk/core`. Use `console.log`/`console.info`/etc. instead of `this.env.LOGGER.info()` — logging is now handled transparently via console override.
