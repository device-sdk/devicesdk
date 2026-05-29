# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Build everything (Turbo handles dependency order: core → cli/api/simulation → dashboard/website)
pnpm build

# Build a single package
pnpm build --filter @devicesdk/api

# Dev servers
pnpm dev --filter @devicesdk/api          # Wrangler dev on port 8787
pnpm dev --filter @devicesdk/dashboard    # Quasar dev server
pnpm dev --filter @devicesdk/simulation   # Vite dev on port 9002

# Tests
pnpm test --filter @devicesdk/api         # integration tests (vitest + cloudflare workers pool)

# Run a single API test file or test name
cd apps/api && npx vitest run --config tests/vitest.config.mts tests/integration/devices.test.ts
cd apps/api && npx vitest run --config tests/vitest.config.mts -t "should create a new device"

# Dashboard UI tests
pnpm test:unit --filter @devicesdk/dashboard  # Vitest component tests (~2s)
pnpm test:e2e --filter @devicesdk/dashboard   # Playwright E2E tests (62 tests, ~90s, starts API + dashboard servers)
pnpm test --filter @devicesdk/dashboard        # Both component + E2E

# Type checking
pnpm check-types --filter @devicesdk/api
pnpm check-types --filter @devicesdk/simulation   # uses vue-tsc
pnpm check-types --filter @devicesdk/dashboard     # uses vue-tsc

# Linting
pnpm lint --filter @devicesdk/api         # Biome
pnpm lint --filter @devicesdk/simulation  # Biome
pnpm lint --filter @devicesdk/dashboard   # ESLint

# D1 database migrations
cd apps/api && npx wrangler d1 migrations apply DB --local
cd apps/api && npx wrangler d1 migrations apply DB --remote
```

## Monorepo Architecture

This is a pnpm + Turborepo monorepo for the DeviceSDK IoT platform. The platform lets users write TypeScript device scripts, deploy them to the cloud, and flash firmware onto microcontrollers that connect via WebSocket.

### Workspace Packages (12 total)

**`packages/core`** (`@devicesdk/core`) — Shared TypeScript types and device abstractions. Published to npm. Exports `"."`, `"./i2c"`, `"./devices/pico"`. Has no runtime dependencies — pure type definitions.

**`packages/cli`** (`@devicesdk/cli`) — CLI tool (`devicesdk` binary). Commands: `login`, `logout`, `whoami`, `init`, `build`, `dev`, `deploy`, `flash`, `logs` (with `--tail`), `status`, `inspect`. Uses esbuild to bundle user device scripts, workerd for local simulation. Build copies Vite build output from `apps/simulation/dist` into `dist/simulator/assets/`.

**`packages/mcp`** (`@devicesdk/mcp`) — Model Context Protocol server (`devicesdk-mcp` binary). Published to npm. Wraps `@devicesdk/cli` (`workspace:*` dep) to expose DeviceSDK as tools for AI coding agents (Claude, Cursor, Copilot): `devicesdk_whoami`, `devicesdk_status`, `devicesdk_logs_tail`, `devicesdk_env_list`/`_set`, `devicesdk_deploy`, `devicesdk_docs_search`. Inherits CLI auth from `~/.devicesdk/auth.json`, with `DEVICESDK_TOKEN` env taking precedence. `devicesdk init` writes the `.mcp.json` entry that launches it. Single source file: `src/index.ts`.

**`packages/typescript-config`** (`@repo/typescript-config`) — Shared `base.json` tsconfig extended by `core` and `cli`.

**`apps/api`** (`@devicesdk/api`) — Cloudflare Workers API using Hono + Chanfana (auto-generates OpenAPI schema). Uses D1 (SQLite) via `workers-qb`, R2 for script/firmware storage, Durable Objects for WebSocket device connections. Depends on `@devicesdk/core` via `workspace:*`.

**`apps/dashboard`** (`@devicesdk/dashboard`) — Vue 3 + Quasar SPA. Google OAuth login, project/device/token management. Deployed to `dash.devicesdk.com`. Requires `shamefully-hoist=true` in `.npmrc` for Quasar compatibility. Runs `quasar prepare` on postinstall. Key composables: `useAuth` (auth state), `useDeviceStream` (WebSocket-based real-time stream of `status`/`log`/`state` frames with exponential-backoff reconnect).

**`apps/simulation`** (`@devicesdk/simulation`) — Vue 3 + Vite app for device simulation UI. Builds to `dist/` which is consumed by the CLI package at build time. Uses Tailwind CSS v4, `@floating-ui/vue` for popovers, and Biome for linting.

**`apps/website`** (`@devicesdk/website`) — Hugo + Tailwind static site. Build requires Playwright browsers for OG image generation (`pnpm exec playwright install`).

**`firmware/esp32`**, **`firmware/pico`** — C/C++ firmware for ESP32 (ESP-IDF) and Raspberry Pi Pico (Pico SDK + CMake). Wrapper `package.json` files gracefully skip builds when toolchains aren't installed.

**`examples/basic`**, **`examples/temperature-to-discord`** — Example projects using `@devicesdk/cli` and `@devicesdk/core`.

### Dependency Graph

```
@repo/typescript-config
  ↓ (extends tsconfig)
@devicesdk/core ──────────→ @devicesdk/api
  ↓                              ↓
@devicesdk/cli ←── @devicesdk/simulation
  ↓        ↓
examples/* @devicesdk/mcp
```

### API Architecture (apps/api)

- **Router**: `src/index.ts` — Hono app with chanfana OpenAPI wrapper. Pre-auth routes (OAuth, CLI auth start) are mounted before `authenticateUser` middleware; everything else requires auth.
- **Endpoints**: `src/endpoints/{resource}/router.ts` defines routes, individual files extend `OpenAPIRoute` with Zod schemas.
- **Auth**: `src/foundation/auth.ts` — checks Bearer token → session cookie → API token (prefix `dsdk_`). User available via `c.get("user")`, query builder via `c.get("qb")`.
- **Durable Objects**: `src/durableObjects/lib/device.ts` — `BaseDevice` handles WebSocket device connections. Uses the Hibernation API (`webSocketMessage`, `webSocketClose`, `webSocketError`). Both `webSocketClose` and `webSocketError` must be implemented — abrupt TCP drops (e.g. device hard reboot) fire `webSocketError`, not `webSocketClose`. Never send a WebSocket close frame immediately after a command that triggers a device reboot; let the connection drop naturally.
- **Real-time streaming**: `GET /v1/projects/:projectId/devices/:deviceId/watch` — WebSocket endpoint that streams `log`, `status`, and `state` frames to dashboard / Home Assistant clients. Uses Hibernation API watcher sockets in `device.ts` (`handleWatcherUpgrade`, `broadcastToWatchers`, `broadcastStateFromMessage`). The legacy `/logs/stream` SSE endpoint was removed in favour of this.
- **Bindings**: `DB` (D1), `SCRIPTS`/`FIRMWARES` (R2), `DEVICE` (Durable Object), `LOADER` (Worker Loader for sandboxed user scripts).
- **Cron**: Two distinct mechanisms. (1) The Worker-level hourly trigger (`"0 * * * *"` in `wrangler.jsonc`) — system cleanup, handler in `src/scheduled.ts` (or routed via `src/index.ts`'s `scheduled` export). See `tests/integration/cronDispatch.test.ts`. (2) Per-device cron schedules (a user script's `crons` map) run off **Durable Object alarms** in `device.ts`'s `alarm()` — one alarm per device DO. These are **connection-gated**: `alarm()` cancels the alarm (via `deleteAlarm()`) when `getWebSockets("device")` is empty so a frequent cron (e.g. `*/1 * * * *`) on a disconnected device doesn't wake the DO and re-invoke the user Worker forever. The schedule stays in storage; `initializeCrons()` re-arms it on reconnect, preserving each cron's `nextFireAt`. If you ever see "crons don't fire while offline," that's intentional — not a bug. Covered by `tests/integration/alarm.test.ts`.
- **Response format**: `{ "success": true, "result": ... }` or `{ "success": false, "error": "..." }`.

### API Testing

Tests use `@cloudflare/vitest-pool-workers` (≥ 0.15) on `vitest@4`. Pool-workers ships as a Vite plugin (`cloudflareTest`) rather than a `defineWorkersConfig` wrapper, and the legacy `isolatedStorage: true` option is gone — bindings persist between `it()` blocks within a file, so suites that mutate D1/KV/Cache must clean up after themselves (see `beforeEach` cleanups in `devices.test.ts`, `scripts.test.ts`, `tokens.test.ts`).

`TieredCache` writes go to both KV and `caches.default`, so test cleanups that delete from KV must also delete the matching `caches.default` Request — see `blockList.test.ts` and `rateLimitBlock.test.ts` for the pattern (URL must match `TieredCache.cacheRequest`'s `encodeURIComponent` layout).

```typescript
import { SELF, env } from "cloudflare:test";
import { TEST_SESSION_TOKEN } from "../setup-test-data";

const resp = await SELF.fetch("http://localhost/v1/...", {
  headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` }
});
```

- `tests/apply-migrations.ts` — applies D1 migrations before tests
- `tests/setup-test-data.ts` — seeds users, projects, sessions (runs once per file via `beforeAll`)
- `tests/vitest.config.mts` — `defineConfig` from `vitest/config` with `cloudflareTest()` plugin holding wrangler/miniflare bindings
- **Coverage**: Istanbul provider configured; run `pnpm --filter @devicesdk/api test:coverage` for HTML/JSON reports in `apps/api/coverage/`. CI uploads coverage artifacts on every run.

### CLI Architecture (packages/cli)

- **Commands**: `src/commands/{build,dev,deploy,flash,login,logout,init,whoami}.ts`
- **Config**: `src/config.ts` — parses `devicesdk.ts` project config
- **Build**: Uses esbuild (ESM, es2022) to bundle user device scripts into `.devicesdk/build`
- **Dev**: Starts workerd-based local simulator with live reload
- **Flash**: Downloads firmware UF2, copies to Pico in BOOTSEL mode (looks for `RPI-RP2` or `RP2350` volumes)

### Firmware (firmware/pico, firmware/esp32)

- **Pico**: C++ with lwIP raw TCP WebSocket client. Single-threaded polling loop. HAL for GPIO/PWM/ADC/I2C. Virtual pin 99 = onboard LED.
- **ESP32**: ESP-IDF v5.5.1 based. Similar WebSocket architecture. HAL functions prefixed `iotkit_hal_`. Supports addressable LEDs (WS2812) via `espressif/led_strip` component — guarded by `CONFIG_IOTKIT_LED_IS_ADDRESSABLE` Kconfig option.
- **ESP32-C61 specifics**: No RMT peripheral — uses SPI backend for led_strip. DevKitC-1 onboard LED is WS2812 on GPIO 5. Config in `firmware/esp32/main/Kconfig.projbuild`.
- **ESP32-C3 specifics**: RISC-V single-core, has RMT — `hal.c` branches on `SOC_RMT_SUPPORTED` and uses the RMT backend for led_strip on C3. DevKitM-1 onboard LED is WS2812 on GPIO 8. Bootloader offset is `0x0` (same as C61). Pre-built target produces `esp32c3-client.bin`.
- Both embed Wi-Fi credentials and API tokens at compile-time via placeholder strings in `config.h` (replaced at build time or via binary patching).
- **Binary patching limitation**: The API's firmware download endpoint patches credentials in merged binaries, but this invalidates ESP-IDF image checksums. For local dev, build from source instead (see TROUBLESHOOT.md).

## Key Configuration Details

- `shamefully-hoist=true` in root `.npmrc` is **required** by Quasar's `@quasar/app-vite`
- `packageManager: pnpm@9.15.4` in root `package.json`
- Node >= 20 required (using v24 via nvm)
- Turbo `^build` ensures dependency-ordered builds
- **Dependency versions are pinned via pnpm catalogs** in `pnpm-workspace.yaml`, not per-package. Shared pins use `catalog:` (`typescript`, `vitest`, `wrangler`, `tsx`, `@types/node`). Named catalogs hold parallel majors for staged migrations: `catalog:zod4`/`catalog:zod3` and `catalog:tailwind4`/`catalog:tailwind3`. Everything is on zod 4 + tailwind 4 today (the v3 catalogs are unused). When adding a shared dep, reference a catalog rather than hardcoding a version.

## Local Development Workflow

To run the full stack locally (API + dashboard + device):

```bash
# 1. Start the API server (port 8787)
pnpm dev --filter @devicesdk/api

# 2. Start the dashboard (separate terminal)
pnpm dev --filter @devicesdk/dashboard

# 3. Deploy a device script to the local API
DEVICESDK_API_URL=http://localhost:8787 pnpm --filter @devicesdk/example-basic deploy

# 4. Flash a device pointing to the local server
pnpm --filter @devicesdk/example-basic flash-local
```

Root-level convenience scripts (defined in the root `package.json`) wrap the same workflow:

```bash
pnpm local          # Run API + dashboard concurrently
pnpm local:login    # devicesdk login against http://localhost:8787
pnpm local:deploy   # Deploy examples/basic to the local API
pnpm local:flash    # Flash a Pico pointing at the local API
```

- **ESP32 local flash** (build from source to avoid checksum issues):
  ```bash
  # 5a. Edit firmware/esp32/main/config.h with real WiFi/token/host credentials
  # 5b. Build and flash
  cd firmware/esp32
  source ~/esp/esp-idf/export.sh
  idf.py build
  python -m esptool --chip esp32c61 -b 460800 --before default_reset --after hard_reset \
    write_flash 0x0 build/bootloader/bootloader.bin 0x8000 build/partition_table/partition-table.bin 0x10000 build/iotkit-client.bin
  # 5c. Restore config.h to placeholder values after flashing
  ```
- `DEVICESDK_API_URL` overrides the CLI's default API endpoint (`https://api.devicesdk.com`). Set it whenever using CLI commands (`deploy`, `dev`, `login`, etc.) against the local server.
- `flash-local` is a convenience script in `examples/basic/package.json` that runs `devicesdk flash device --host 192.168.1.238:8787`.
- Ensure `apps/api/.dev.vars` contains `ENV=local` so local auth code paths activate.

## Public-Facing Content Guidelines

- **Never mention Cloudflare, Cloudflare Workers, or any Cloudflare product names** (D1, R2, Durable Objects, KV as "Cloudflare KV", Wrangler, Cloudflare Pages) in any public-facing content — this includes the website (`apps/website/layouts/`, `apps/website/content/`), public documentation (`docs/public/`), and any user-visible strings.
- DeviceSDK is a **managed platform**. Use generic infrastructure terms instead: "globally distributed runtime", "serverless runtime", "edge infrastructure", "managed platform".
- Internal code, configs, and developer-only files (e.g., `wrangler.jsonc`, API source code, CLAUDE.md itself, **`docs/internal/`**) may reference Cloudflare as needed. The Hugo build mounts `docs/public/` only; nothing under `docs/internal/` is ever shipped to the public docs site.

## Anti-Redundancy Rules

- **Search before creating**: Before writing a new utility, helper, type, or abstraction, search the codebase for existing implementations. Check `packages/core`, `apps/api/src/foundation/`, and existing endpoint patterns.
- **Import from canonical sources**: Types come from `@devicesdk/core`, auth/middleware from `src/foundation/`, query patterns from `workers-qb`. Never duplicate these locally.
- **One source of truth**: If the same logic exists in multiple places, refactor into a shared location. Do not create "V2" copies.

## Source-of-Truth Locations

| Concern | Canonical Location |
|---------|-------------------|
| Shared types and device abstractions | `packages/core` |
| Auth middleware, session handling, OAuth | `apps/api/src/foundation/auth.ts` |
| Auth caching (TieredCache) | `apps/api/src/foundation/authCache.ts` |
| Tiered cache (caches.default + KV) | `apps/api/src/foundation/tieredCache.ts` |
| Cross-route block list middleware | `apps/api/src/foundation/userBlockList.ts` |
| Edge rate-limit rule (Cloudflare WAF) | `docs/internal/operations/cloudflare-waf.md` |
| Session constants | `apps/api/src/foundation/consts.ts` |
| Script validation | `apps/api/src/foundation/scriptValidator.ts` |
| Device reboot trigger | `apps/api/src/foundation/deviceReboot.ts` |
| ESP32 image checksum recalculation | `apps/api/src/foundation/esp32ImageChecksum.ts` |
| Endpoint patterns | `apps/api/src/endpoints/` (follow existing resource structure) |
| Database schema | `apps/api/migrations/` (sequential SQL files) |
| Table type definitions | `apps/api/src/types.d.ts` |
| Query builder patterns | Existing endpoints + `.claude/skills/write-sql-queries/SKILL.md` |
| Inter-device RPC types | `packages/core/src/index.ts` (`RemoteDevice`, `GetEnv`) |
| DevicesBridge (inter-device RPC) | `apps/api/src/durableObjects/lib/devicesBridge.ts` |
| CLI type generation | `packages/cli/src/commands/build.ts` (`generateDeviceTypes`) |
| MCP server (AI-agent tools) | `packages/mcp/src/index.ts` |
| Real-time watch WebSocket (canonical) | `apps/api/src/endpoints/devices/watchDevice.ts`, `apps/api/src/durableObjects/lib/device.ts` (`handleWatcherUpgrade`, `broadcastToWatchers`, `broadcastStateFromMessage`) |
| Dashboard watch WebSocket composable | `apps/dashboard/src/composables/useDeviceStream.ts` |
| HA entity declaration types | `packages/core/src/index.ts` (`HaEntityDeclaration`, `HaEntityType`, `HaEntitySource`) |
| HA entity persistence | `apps/api/src/endpoints/devices/getDeviceEntities.ts`, `apps/api/src/endpoints/devices/upsertDeviceEntities.ts`, `device_entity_configs` table |
| License | `LICENSE` (proprietary, all rights reserved) |

## Audit-finding sanity-check

When an audit (security, code-quality, etc.) flags something in this codebase, **trace the actual call path before acting**. The May 2026 audit follow-up flagged 4 "security" issues; 3 were false alarms because the audit agent didn't follow the chain through to where authorization actually happens. Common patterns that *look* like vulnerabilities but aren't:

- **Durable Object query params look untrusted, but they aren't.** `apps/api/src/durableObjects/lib/device.ts` reads `userId` / `projectId` / `deviceId` from the WebSocket upgrade URL. These come from the authenticated server route (`apps/api/src/endpoints/devices/deviceConnect.ts:41–151`) which authenticates the user, looks up `project.id` / `device.id` from D1 with a `user_id = ?` constraint, and passes the *server-derived* IDs to the DO. The client cannot forge them. The watcher endpoint (`watchDevice.ts` → `foundation/projectDeviceResolve.ts:18–56`) follows the same pattern.
- **DO `fetch()` handlers don't re-authenticate, and they don't need to.** Durable Objects are only reachable through their bindings; there is no public route to a DO. Authentication happens on the API route that resolves the stub. Adding "auth checks inside the DO" duplicates the gate without adding security.
- **`Sentry.withSentry()` wraps both `fetch` and `scheduled`.** `apps/api/src/index.ts:218–228`. Unhandled exceptions in `handleScheduled` are captured by the Sentry integration; you don't need an explicit top-level try/catch for cron failures to land in Sentry.

When in doubt, grep for the entry point (`grep -rn 'env.DEVICE.idFromName' apps/api/src/`, `grep -rn 'authenticateUser' apps/api/src/`) and trace to the DO before assuming the DO is reachable from the public internet.

## Multi-Agent Safety

- **Multi-agent safety:** do **not** create/apply/drop `git stash` entries unless explicitly requested. Assume other agents may be working; keep unrelated WIP untouched.
- **Multi-agent safety:** when the user says "push", you may `git pull --rebase` to integrate latest changes (never discard other agents' work). When the user says "commit", scope to your changes only.
- **Multi-agent safety:** create your **own** worktree per change (named after the change — see Git Workflow). Never create, remove, or modify a worktree or branch you didn't create — other agents may be using it.
- **Multi-agent safety:** do **not** switch branches unless explicitly requested.
- **Multi-agent safety:** running multiple agents is OK as long as each agent has its own session.
- **Multi-agent safety:** when you see unrecognized files, keep going; focus on your changes and commit only those.

## Git Workflow

- **Never commit directly to `main`, and never work in the main checkout.** Do every change in its own dedicated git worktree. Choose one kebab-case **change name** (the same slug you'll use for the changeset, e.g. `per-page-og-images`) and use it verbatim for **both** the worktree directory and the branch:

  ```bash
  git worktree add .worktrees/<change-name> -b <change-name>
  ```

  `.worktrees/` is gitignored — reserve `.claude/worktrees/` for harness-managed isolated agents and `.worktrees/pr-*` for PR-review checkouts. After the change merges, clean up with `git worktree remove .worktrees/<change-name>`.
- **Before every commit**, run `pnpm lint` to fix lint issues. Do not commit if linting fails.
- **Every PR must include a changeset**. Before opening or updating a PR, create a `.changeset/<descriptive-name>.md` file using the format in any prior PR's changeset entry (or `.changeset/README.md` for the format reference). Use `patch` for bug fixes, `minor` for new features. Reference every workspace package the change touches — this covers both the npm-published packages (`@devicesdk/api`, `@devicesdk/core`, `@devicesdk/cli`, `@devicesdk/mcp`) **and the private apps that maintain their own changelog** (`@devicesdk/website`, `@devicesdk/dashboard`, `@devicesdk/simulation`). Firmware, examples, and shared configs are not versioned and do not need changeset entries.
- **Never set a `major` bump in a changeset without explicit user consent.** When a change is genuinely breaking, surface that explicitly and ask before writing the changeset. Do **not** soften the change with back-compat aliases unless the user asks — declining a major bump is not a request for back-compat, it just means ship without the major-bump ceremony.
- **Finish the change by opening a PR.** Once the feature is complete in its worktree — committed, `pnpm lint` clean, and (where required) a changeset added — push the branch and open a PR with `gh pr create --base main` before reporting back. Don't leave the work sitting on an un-pushed local branch. Summarize what landed and link the PR. (Exception: only skip the PR if the user explicitly asked to stop before pushing.)

## CI Runner Image

CI jobs labelled `[self-hosted, linux, proxmox-ephemeral]` run on a Proxmox VM image the user maintains out-of-band. If a workflow needs a system package that isn't present (e.g. `libusb-1.0-0` for ESP-IDF's `openocd-esp32` post-install verify), **ask the user to add it to the base build image** — do **not** patch the workflow with a userspace `apt-get download` / `LD_LIBRARY_PATH` workaround unless the user explicitly opts for that. The runner has no passwordless sudo, so workflow-side `sudo apt-get install` won't work either. When you do need to ask, name the specific package and which workflow step requires it. The build job in `firmware-esp32.yml` keeps a comment near `runs-on:` listing currently-required system libs — update it whenever a new prereq is added to the image.

## Coding Standards

- **Strict types**: Do not use `any` in implementation code. Use `unknown` and narrow with type guards when needed.
- **Validate at boundaries**: All external input (API request bodies, CLI args, environment variables, WebSocket messages) must be validated with Zod or explicit checks.
- **File size**: Keep files under ~700 LOC. Split large files into focused modules.
- **Response format**: Always use `{ success: true, result: ... }` or `{ success: false, error: "..." }` in API responses.
- **IDs**: Use `crypto.randomUUID()` for new record IDs. Timestamps use `Date.now()` (epoch milliseconds).

## Troubleshooting Log

Maintain a `TROUBLESHOOT.md` file at the repository root. This file serves as a persistent knowledge base of problems encountered and their solutions.

### Rules

- **Consult first**: When you feel stuck, encounter an error you don't immediately understand, or hit a recurring issue, **read `TROUBLESHOOT.md` before trying other approaches**. The answer may already be there.
- **Record mistakes**: Whenever you make a mistake, misunderstand something, or discover a non-obvious solution, add an entry to `TROUBLESHOOT.md`.
- **Record questions and answers**: If you had to investigate or ask the user to resolve an issue, document the question and the answer.
- **Format**: Each entry should follow this structure:
  ```markdown
  ### <Short description of the problem>
  **Date**: YYYY-MM-DD
  **Question/Problem**: What went wrong or what was confusing?
  **Root Cause**: Why did it happen?
  **Solution**: How was it fixed?
  ```
- **Keep it actionable**: Write entries so that a future agent (or yourself in a new session) can immediately apply the solution without re-investigating.
- **Don't duplicate**: Before adding a new entry, check if a similar one already exists. Update the existing entry instead if needed.

## Knowledge Capture

After completing any significant task (feature, bugfix, architectural change), **stop and evaluate** whether the work produced knowledge worth persisting:

- **CLAUDE.md**: Update if new canonical file paths, build commands, architectural patterns, or conventions were established.
- **TROUBLESHOOT.md**: Add entries for any non-obvious problems encountered, debugging dead-ends, or workarounds discovered.
- **Claude Skills** (`.claude/skills/`): Create or update a skill if a repeatable workflow or domain-specific pattern emerged that future sessions would benefit from.
- **Auto-memory** (`~/.claude/projects/.../memory/MEMORY.md`): Record hardware-specific findings, environment quirks, or user preferences.

This is not optional — treat it as the final step of every significant task, before reporting completion to the user.
