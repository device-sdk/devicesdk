# DeviceSDK

IoT platform for writing TypeScript device scripts, deploying them to Cloudflare Workers, and flashing firmware onto microcontrollers that connect via WebSocket.

## Getting Started

**Prerequisites:** Node.js 22+, [pnpm](https://pnpm.io/) 9.x

```bash
git clone <repo-url> && cd devicesdk-monorepo
pnpm install
pnpm build
```

See [docs/quickstart.md](docs/quickstart.md) for a full tutorial on creating your first project.

## Project Structure

| Package | Name | Description |
|---|---|---|
| `packages/core` | `@devicesdk/core` | Shared TypeScript types and device abstractions (published to npm) |
| `packages/cli` | `@devicesdk/cli` | CLI tool (`devicesdk`) — init, build, dev, deploy, flash |
| `packages/typescript-config` | `@repo/typescript-config` | Shared tsconfig base |
| `apps/api` | `@devicesdk/api` | Cloudflare Workers API (Hono + D1 + R2 + Durable Objects) |
| `apps/dashboard` | `@devicesdk/dashboard` | Vue 3 + Quasar SPA — project/device/token management |
| `apps/simulation` | `@devicesdk/simulation` | Vue 3 device simulation UI (static export consumed by CLI) |
| `apps/website` | `@devicesdk/website` | Hugo + Tailwind marketing site |
| `firmware/pico` | — | Raspberry Pi Pico W firmware (C++, lwIP WebSocket) |
| `firmware/esp32` | — | ESP32 firmware (ESP-IDF, WebSocket) |
| `examples/basic` | — | Basic example project |
| `examples/temperature-to-discord` | — | Temperature sensor to Discord webhook example |

### Dependency Graph

```
@repo/typescript-config
  |
  v (extends tsconfig)
@devicesdk/core ---------> @devicesdk/api
  |                             |
  v                             v
@devicesdk/cli <------- @devicesdk/simulation
  |
  v
examples/*
```

## Development

### Common Commands

| Command | Description |
|---|---|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build all packages (Turbo handles dependency order) |
| `pnpm dev --filter <pkg>` | Start dev server for a package |
| `pnpm test --filter <pkg>` | Run tests for a package |
| `pnpm lint --filter <pkg>` | Lint a package |
| `pnpm check-types --filter <pkg>` | Type-check a package |

### Per-Package Dev

```bash
pnpm dev --filter @devicesdk/api          # Wrangler dev on port 9000
pnpm dev --filter @devicesdk/dashboard    # Quasar dev server
pnpm dev --filter @devicesdk/simulation   # Next.js on port 9002
```

### Testing

```bash
pnpm test --filter @devicesdk/api         # Run all API tests (63 tests)

# Run a single test file
cd apps/api && npx vitest run --config tests/vitest.config.mts tests/integration/devices.test.ts

# Run a single test by name
cd apps/api && npx vitest run --config tests/vitest.config.mts -t "should create a new device"
```

### Database Migrations

```bash
cd apps/api && npx wrangler d1 migrations apply DB --local   # Local
cd apps/api && npx wrangler d1 migrations apply DB --remote  # Production
```

## CLI

The `@devicesdk/cli` package provides the `devicesdk` command:

| Command | Description |
|---|---|
| `login` | Authenticate with DeviceSDK |
| `init` | Scaffold a new project |
| `build` | Bundle device scripts with esbuild |
| `dev` | Local dev server with workerd-based simulator |
| `deploy` | Deploy scripts to Cloudflare Workers |
| `flash` | Flash firmware onto a Pico W or ESP32 |

## Architecture

Devices running custom firmware connect via WebSocket to Cloudflare Workers at the edge. Each device connection is managed by a Durable Object, which loads and executes the user's TypeScript device script in a sandboxed Worker.

Devices within the same project can call methods on each other via type-safe RPC (`this.env.DEVICES["other-device"].method()`). The CLI auto-generates `devicesdk-env.d.ts` with full TypeScript types for inter-device communication.

**Tech stack:** Hono (API framework), Chanfana (OpenAPI), D1/SQLite (database), R2 (script/firmware storage), Durable Objects (device connections), Vue 3 + Quasar (dashboard), Vue 3 (simulation UI), Hugo (website).

## Firmware

The Pico W and ESP32 firmware implement a WebSocket client that connects to the DeviceSDK API. Wi-Fi credentials and API tokens are embedded at compile time via CMake.

Firmware builds gracefully skip when toolchains (`idf.py`, `cmake`) aren't installed, so they won't block `pnpm build`.

## Documentation

- [Getting Started](docs/quickstart.md)
- [CLI Reference](docs/cli.md)
- [Dashboard](https://dash.devicesdk.com)
