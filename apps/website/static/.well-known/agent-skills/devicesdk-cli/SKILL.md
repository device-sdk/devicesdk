---
name: devicesdk-cli
description: The devicesdk CLI (npm i -g @devicesdk/cli) builds, deploys, flashes, and inspects DeviceSDK projects. A project is defined by a devicesdk.ts config that maps device slugs to TypeScript entrypoint classes under src/entrypoints/.
---

## Commands
- `devicesdk login` — OAuth browser flow; stores a session token locally.
- `devicesdk logout` / `devicesdk whoami` — session management.
- `devicesdk init [name]` — scaffold a new project with a sample device script.
- `devicesdk dev` — run the local simulator with live reload.
- `devicesdk build` — esbuild-bundle all device scripts into `.devicesdk/build/`.
- `devicesdk deploy [--device <slug>] [--dry-run] [--message <text>]` — upload a new version.
- `devicesdk flash <device> [--host <hostport>]` — flash Pico (via BOOTSEL volume) or ESP32.
- `devicesdk logs <project> <device> [--tail]` — view or stream logs.
- `devicesdk status` — summary of devices and their latest deployed versions.
- `devicesdk inspect <device>` — open an interactive REPL against a live device.

## Project layout
- `devicesdk.ts` — project config: devices, entrypoints, env vars, Home Assistant entity declarations.
- `src/entrypoints/*.ts` — per-device entrypoint classes that extend `DeviceEntrypoint`.
- `.devicesdk/build/` — esbuild output (gitignored).

## Environment override
`DEVICESDK_API_URL=http://localhost:8787` points any CLI command at a locally running API instead of the managed one.

## See also
- Examples: <https://devicesdk.com/examples>
- REST API equivalent: `devicesdk-api` skill.
