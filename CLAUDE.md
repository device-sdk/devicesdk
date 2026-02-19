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
pnpm test --filter @devicesdk/api         # 63 integration tests (vitest + cloudflare workers pool)

# Run a single API test file or test name
cd apps/api && npx vitest run --config tests/vitest.config.mts tests/integration/devices.test.ts
cd apps/api && npx vitest run --config tests/vitest.config.mts -t "should create a new device"

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

**`packages/cli`** (`@devicesdk/cli`) — CLI tool (`devicesdk` binary). Commands: `login`, `init`, `build`, `dev`, `deploy`, `flash`. Uses esbuild to bundle user device scripts, workerd for local simulation. Build copies Vite build output from `apps/simulation/dist` into `dist/simulator/assets/`.

**`packages/typescript-config`** (`@repo/typescript-config`) — Shared `base.json` tsconfig extended by `core` and `cli`.

**`apps/api`** (`@devicesdk/api`) — Cloudflare Workers API using Hono + Chanfana (auto-generates OpenAPI schema). Uses D1 (SQLite) via `workers-qb`, R2 for script/firmware storage, Durable Objects for WebSocket device connections. Depends on `@devicesdk/core` via `workspace:*`.

**`apps/dashboard`** (`@devicesdk/dashboard`) — Vue 3 + Quasar SPA. Google OAuth login, project/device/token management. Deployed to `dash.devicesdk.com`. Requires `shamefully-hoist=true` in `.npmrc` for Quasar compatibility. Runs `quasar prepare` on postinstall.

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
  ↓
examples/*
```

### API Architecture (apps/api)

- **Router**: `src/index.ts` — Hono app with chanfana OpenAPI wrapper. Pre-auth routes (OAuth, CLI auth start) are mounted before `authenticateUser` middleware; everything else requires auth.
- **Endpoints**: `src/endpoints/{resource}/router.ts` defines routes, individual files extend `OpenAPIRoute` with Zod schemas.
- **Auth**: `src/foundation/auth.ts` — checks Bearer token → session cookie → API token (prefix `dsdk_`). User available via `c.get("user")`, query builder via `c.get("qb")`.
- **Durable Objects**: `src/durableObjects/lib/device.ts` — `BaseDevice` handles WebSocket device connections. Uses the Hibernation API (`webSocketMessage`, `webSocketClose`, `webSocketError`). Both `webSocketClose` and `webSocketError` must be implemented — abrupt TCP drops (e.g. device hard reboot) fire `webSocketError`, not `webSocketClose`. Never send a WebSocket close frame immediately after a command that triggers a device reboot; let the connection drop naturally.
- **Bindings**: `DB` (D1), `SCRIPTS`/`FIRMWARES` (R2), `DEVICE` (Durable Object), `LOADER` (Worker Loader for sandboxed user scripts).
- **Response format**: `{ "success": true, "result": ... }` or `{ "success": false, "error": "..." }`.

### API Testing

Tests use `@cloudflare/vitest-pool-workers` which runs tests inside a real Cloudflare Workers runtime. The API **requires `vitest` as an explicit devDependency** (not just the peer from the pool-workers package) to avoid version conflicts in the monorepo.

```typescript
import { SELF, env } from "cloudflare:test";
import { TEST_SESSION_TOKEN } from "../setup-test-data";

const resp = await SELF.fetch("http://localhost/v1/...", {
  headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` }
});
```

- `tests/apply-migrations.ts` — applies D1 migrations before tests
- `tests/setup-test-data.ts` — seeds users, projects, sessions
- `tests/vitest.config.mts` — configures pool-workers with wrangler bindings

### CLI Architecture (packages/cli)

- **Commands**: `src/commands/{build,dev,deploy,flash,login,logout,init,whoami}.ts`
- **Config**: `src/config.ts` — parses `devicesdk.ts` project config
- **Build**: Uses esbuild (ESM, es2022) to bundle user device scripts into `.devicesdk/build`
- **Dev**: Starts workerd-based local simulator with live reload
- **Flash**: Downloads firmware UF2, copies to Pico in BOOTSEL mode (looks for `RPI-RP2` or `RP2350` volumes)

### Firmware (firmware/pico, firmware/esp32)

- **Pico**: C++ with lwIP raw TCP WebSocket client. Single-threaded polling loop. HAL for GPIO/PWM/ADC/I2C. Virtual pin 99 = onboard LED.
- **ESP32**: ESP-IDF based. Similar WebSocket architecture.
- Both embed Wi-Fi credentials and API tokens at compile-time via CMake definitions.

## Key Configuration Details

- `shamefully-hoist=true` in root `.npmrc` is **required** by Quasar's `@quasar/app-vite`
- `packageManager: pnpm@9.15.4` in root `package.json`
- Node >= 20 required (using v22 via nvm)
- Turbo `^build` ensures dependency-ordered builds
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

- `DEVICESDK_API_URL` overrides the CLI's default API endpoint (`https://api.devicesdk.com`). Set it whenever using CLI commands (`deploy`, `dev`, `login`, etc.) against the local server.
- `flash-local` is a convenience script in `examples/basic/package.json` that runs `devicesdk flash device --host 192.168.1.238:8787`.
- Ensure `apps/api/.dev.vars` contains `ENV=local` so local auth code paths activate.

## Public-Facing Content Guidelines

- **Never mention Cloudflare, Cloudflare Workers, or any Cloudflare product names** (D1, R2, Durable Objects, KV as "Cloudflare KV", Wrangler, Cloudflare Pages) in any public-facing content — this includes the website (`apps/website/layouts/`, `apps/website/content/`), documentation (`docs/`), and any user-visible strings.
- DeviceSDK is a **managed platform**. Use generic infrastructure terms instead: "globally distributed runtime", "serverless runtime", "edge infrastructure", "managed platform".
- Internal code, configs, and developer-only files (e.g., `wrangler.jsonc`, API source code, CLAUDE.md itself) may reference Cloudflare as needed.

## Anti-Redundancy Rules

- **Search before creating**: Before writing a new utility, helper, type, or abstraction, search the codebase for existing implementations. Check `packages/core`, `apps/api/src/foundation/`, and existing endpoint patterns.
- **Import from canonical sources**: Types come from `@devicesdk/core`, auth/middleware from `src/foundation/`, query patterns from `workers-qb`. Never duplicate these locally.
- **One source of truth**: If the same logic exists in multiple places, refactor into a shared location. Do not create "V2" copies.

## Source-of-Truth Locations

| Concern | Canonical Location |
|---------|-------------------|
| Shared types and device abstractions | `packages/core` |
| Auth middleware, session handling, OAuth | `apps/api/src/foundation/auth.ts` |
| Session constants | `apps/api/src/foundation/consts.ts` |
| Script validation | `apps/api/src/foundation/scriptValidator.ts` |
| Device reboot trigger | `apps/api/src/foundation/deviceReboot.ts` |
| Endpoint patterns | `apps/api/src/endpoints/` (follow existing resource structure) |
| Database schema | `apps/api/migrations/` (sequential SQL files) |
| Table type definitions | `apps/api/src/types.d.ts` |
| Query builder patterns | Existing endpoints + `.claude/skills/write-sql-queries/SKILL.md` |

## Multi-Agent Safety

- **Multi-agent safety:** do **not** create/apply/drop `git stash` entries unless explicitly requested. Assume other agents may be working; keep unrelated WIP untouched.
- **Multi-agent safety:** when the user says "push", you may `git pull --rebase` to integrate latest changes (never discard other agents' work). When the user says "commit", scope to your changes only.
- **Multi-agent safety:** do **not** create/remove/modify `git worktree` checkouts unless explicitly requested.
- **Multi-agent safety:** do **not** switch branches unless explicitly requested.
- **Multi-agent safety:** running multiple agents is OK as long as each agent has its own session.
- **Multi-agent safety:** when you see unrecognized files, keep going; focus on your changes and commit only those.

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
