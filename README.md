# DeviceSDK

IoT platform for writing TypeScript device scripts, deploying them to our managed edge runtime, and flashing firmware onto microcontrollers that connect via WebSocket.

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
| `packages/cli` | `@devicesdk/cli` | CLI tool (`devicesdk`) — init, build, dev, deploy, flash, logs, status, inspect |
| `packages/typescript-config` | `@repo/typescript-config` | Shared tsconfig base |
| `apps/api` | `@devicesdk/api` | Edge API (Hono + Chanfana, managed edge runtime) |
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
pnpm dev --filter @devicesdk/api          # API dev server on port 9000
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

See `CLAUDE.md` for internal migration commands.

## CLI

The `@devicesdk/cli` package provides the `devicesdk` command:

| Command | Description |
|---|---|
| `login` | Authenticate with DeviceSDK |
| `init` | Scaffold a new project |
| `build` | Bundle device scripts with esbuild |
| `dev` | Local dev server with workerd-based simulator |
| `deploy` | Deploy scripts to the managed runtime |
| `flash` | Flash firmware onto a Pico W or ESP32 |
| `logs` | View and stream device logs (`--tail` for real-time) |
| `status` | Show live connection status for devices in a project |

## Architecture

Devices running custom firmware connect via WebSocket to the managed edge runtime. Each device connection is managed by a per-device state container, which loads and executes the user's TypeScript device script in an isolated sandbox.

Devices within the same project can call methods on each other via type-safe RPC (`this.env.DEVICES["other-device"].method()`). The CLI auto-generates `devicesdk-env.d.ts` with full TypeScript types for inter-device communication.

**Tech stack:** Hono (API framework), Chanfana (OpenAPI), Vue 3 + Quasar (dashboard), Vue 3 (simulation UI), Hugo (website). Deployed on a managed edge runtime.

## Firmware

The Pico W and ESP32 firmware implement a WebSocket client that connects to the DeviceSDK API. Wi-Fi credentials and API tokens are embedded at compile time via CMake.

Firmware builds gracefully skip when toolchains (`idf.py`, `cmake`) aren't installed, so they won't block `pnpm build`.

## Documentation

- [Getting Started](docs/quickstart.md)
- [CLI Reference](docs/cli.md)
- [Dashboard](https://dash.devicesdk.com)
