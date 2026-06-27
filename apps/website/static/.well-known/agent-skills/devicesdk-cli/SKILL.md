---
name: devicesdk-cli
description: The devicesdk CLI (npm i -g @devicesdk/cli) builds, deploys, flashes, and inspects DeviceSDK projects against a server you self-host. A project is defined by a devicesdk.ts config that maps device slugs to TypeScript entrypoint classes under src/entrypoints/.
---

## Commands
- `devicesdk login` - authenticate against your self-hosted server (device-code flow); the CLI auto-discovers it via mDNS (`devicesdk.local` by default). Pass `--host http://<server>:8080` only when mDNS isn't available on your network, you use a custom `MDNS_HOSTNAME`, or the CLI runs on the same machine as the server. Stores host + token in `~/.devicesdk/credentials.json`.
- `devicesdk logout` / `devicesdk whoami` - session management.
- `devicesdk init [name]` - scaffold a new project with a sample device script.
- `devicesdk dev` - run the local simulator with live reload.
- `devicesdk build` - esbuild-bundle all device scripts into `.devicesdk/build/`.
- `devicesdk deploy [--device <slug>] [--dry-run] [--message <text>]` - upload a new version.
- `devicesdk flash <device> [--host <hostport>]` - flash Pico (via BOOTSEL volume) or ESP32.
- `devicesdk logs <project> <device> [--tail]` - view or stream logs.
- `devicesdk status` - summary of devices and their latest deployed versions.
- `devicesdk inspect <device>` - open an interactive REPL against a live device.

## Project layout
- `devicesdk.ts` - project config: devices, entrypoints, env vars, Home Assistant entity declarations.
- `src/entrypoints/*.ts` - per-device entrypoint classes that extend `DeviceEntrypoint`.
- `.devicesdk/build/` - esbuild output (gitignored).

## Host selection
The target server is resolved in this order: `DEVICESDK_API_URL` env var → `--host` flag → the host stored in `~/.devicesdk/credentials.json` → mDNS auto-discovery (`devicesdk.local` by default). mDNS is the last resort, so running `devicesdk login` with no flags works on most home/office LANs. For CI, supply `DEVICESDK_TOKEN` and `DEVICESDK_API_URL` (mDNS is unreliable in CI environments).

## See also
- Examples: <https://devicesdk.com/examples>
- REST API equivalent: `devicesdk-api` skill.
