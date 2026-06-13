# DeviceSDK

**Free, open-source, self-hosted IoT platform.** Write TypeScript device scripts, run the DeviceSDK server on your own hardware (Raspberry Pi, NUC, NAS, any Docker host), and connect ESP32 / Raspberry Pi Pico microcontrollers to it over WebSocket.

No cloud, no SaaS, no per-message billing — your hardware, your data. Licensed under **AGPL-3.0-only**.

## Run the server

The whole platform — REST API, device & watcher WebSockets, and the dashboard UI — is a single container listening on one port.

```bash
docker compose up -d
# open http://localhost:8080  →  the first account you register becomes the admin
```

Devices on your LAN connect to `ws://<this-machine>:8080`. All state (SQLite database, device scripts, firmware images) is persisted under the `./data` volume you control.

The server also advertises itself over **mDNS** as `devicesdk.local`, so you can reach it — and flash devices against it — without knowing its LAN IP (`http://devicesdk.local:8080`). Set `MDNS_HOSTNAME` to a different name to run several DeviceSDK servers on one network.

Useful environment variables (see `docker-compose.yml`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP port for the API, WebSockets, and dashboard |
| `DATA_DIR` | `/data` | Root for all persistent state |
| `ALLOW_REGISTRATION` | `true` | Set `false` to close sign-ups after your account exists |
| `SECURE_COOKIES` | `false` | Set `true` when serving behind an HTTPS reverse proxy |
| `MDNS_HOSTNAME` | `devicesdk` | Advertised mDNS name (`<name>.local`); change to run multiple servers on one LAN |
| `MDNS_ENABLED` | `true` | Set `false` to disable mDNS advertisement |

See [docs/public/quickstart.md](docs/public/quickstart.md) for the full zero-to-first-deploy walkthrough.

## Develop a device project

The `devicesdk` CLI (npm, runs on Node) builds and deploys device scripts to **your** server. It has no default server URL — point it at your install once with `--host`:

```bash
npx @devicesdk/cli login --host http://localhost:8080
npx @devicesdk/cli init hello-world
cd hello-world
npx @devicesdk/cli deploy
npx @devicesdk/cli logs <project-id> <device-id> --tail
```

## Building from source

**Prerequisites:** Node.js 22+, [pnpm](https://pnpm.io/) 9.x, and [Bun](https://bun.sh/) 1.3.14+ (server runtime).

```bash
git clone https://github.com/device-sdk/devicesdk-monorepo && cd devicesdk-monorepo
pnpm install
pnpm build
```

To build the Docker image yourself instead of pulling from GHCR:

```bash
docker build -t devicesdk .
```

## Project Structure

pnpm + Turborepo monorepo. **Bun is the server runtime only** — the CLI and MCP run on plain Node for npm users.

| Package | Name | Description |
|---|---|---|
| `apps/server` | `@devicesdk/server` | The backend: Bun + Hono + Chanfana + Zod + `bun:sqlite`. One process, one port — REST API (`/v1/*`), device + watcher WebSockets, dashboard SPA, OpenAPI docs (`/api-docs`) |
| `apps/dashboard` | `@devicesdk/dashboard` | Vue 3 + Quasar SPA — local email/password auth, project/device/token management. Served same-origin by the server |
| `apps/simulation` | `@devicesdk/simulation` | Vue 3 device-simulation UI (static export consumed by the CLI `dev` command) |
| `apps/website` | `@devicesdk/website` | Hugo + Tailwind marketing & docs site |
| `packages/core` | `@devicesdk/core` | Shared TypeScript types and the `DeviceEntrypoint` base class (published to npm) |
| `packages/cli` | `@devicesdk/cli` | CLI tool (`devicesdk`) — login, init, build, dev, deploy, flash, logs, status, inspect |
| `packages/mcp` | `@devicesdk/mcp` | Model Context Protocol server wrapping the CLI for AI agents |
| `packages/typescript-config` | `@repo/typescript-config` | Shared tsconfig base |
| `firmware/esp32` | — | ESP32 firmware (ESP-IDF, WebSocket client) |
| `firmware/pico` | — | Raspberry Pi Pico W firmware (C++, lwIP WebSocket client) |
| `examples/*` | — | Example device projects (`basic`, `temperature-to-discord`, `esp32c3-clock`) |

## Development

### Common Commands

| Command | Description |
|---|---|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build all packages (Turbo handles dependency order) |
| `pnpm local` | Run the server (`:8080`) + dashboard (`:9000`) concurrently |
| `pnpm dev --filter <pkg>` | Start a dev server for one package |
| `pnpm test --filter <pkg>` | Run tests for a package |
| `pnpm lint --filter <pkg>` | Lint a package (Biome) |
| `pnpm check-types --filter <pkg>` | Type-check a package |

### Per-Package Dev

```bash
pnpm dev --filter @devicesdk/server       # Bun server (bun run --watch) on port 8080
pnpm dev --filter @devicesdk/dashboard    # Quasar dev server on port 9000
pnpm dev --filter @devicesdk/simulation   # Vite dev server on port 9002
```

The server stores all state under `DATA_DIR` (default `./data`): `devicesdk.sqlite` (WAL),
`scripts/{userId}/{projectSlug}/{deviceSlug}/{versionId}.js`, and `firmwares/`.

## CLI

The `@devicesdk/cli` package provides the `devicesdk` command. The server URL is resolved from
`DEVICESDK_API_URL` → the `--host` flag → the host saved in `~/.devicesdk/credentials.json` by
`devicesdk login --host <url>`.

| Command | Description |
|---|---|
| `login` | Authenticate the CLI against your server (`--host` required on first use) |
| `init` | Scaffold a new project |
| `build` | Bundle device scripts with esbuild |
| `dev` | Local dev server with the workerd-based simulator |
| `deploy` | Deploy scripts to your server (creates an immutable version) |
| `flash` | Flash firmware onto a Pico W or ESP32 |
| `logs` | View and stream device logs (`--tail` for real-time) |
| `status` | Show live connection status for devices in a project |

## Architecture

Devices running DeviceSDK firmware connect over WebSocket to the server you run. Each device
connection is handled by an in-process **device session** that loads and runs your TypeScript
device script. Because the server is yours and the scripts are your own code, scripts run
**in-process** — there is no sandboxed cloud runtime.

Devices within the same project can call methods on each other via type-safe RPC
(`this.env.DEVICES["other-device"].method()`). The CLI auto-generates `devicesdk-env.d.ts`
with full TypeScript types for inter-device communication.

**Tech stack:** Bun + Hono (server), Chanfana (OpenAPI), `bun:sqlite` (storage),
Vue 3 + Quasar (dashboard), Vue 3 (simulation UI), Hugo (website).

## Firmware

The Pico W and ESP32 firmware implement a WebSocket client that connects to your DeviceSDK
server. Wi-Fi credentials and the server host are configured at flash time. The firmware uses
plain `ws://` when the configured host includes an explicit port (self-hosted LAN) and TLS on
443 for bare hostnames. The host can be an mDNS name — flashing with
`--host http://devicesdk.local:8080` lets the device resolve the server over mDNS, so it keeps
working even if the server's DHCP lease changes. Prebuilt binaries are published to rolling
GitHub Releases and bundled into the Docker image; `devicesdk flash` fetches the matching binary
from your server.

Firmware builds gracefully skip when toolchains (`idf.py`, `cmake`) aren't installed, so they
won't block `pnpm build`.

## Documentation

- [Quickstart](docs/public/quickstart.md)
- [CLI Reference](docs/public/cli/_index.md)
- [Platform Architecture](docs/public/concepts/architecture.md)
- [Roadmap](ROADMAP.md) — Home Assistant integration is the flagship next step

## License

[AGPL-3.0-only](LICENSE).
