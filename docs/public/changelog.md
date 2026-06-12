---
title: Changelog
description: Latest releases and updates for DeviceSDK
social_image: /og-images/docs/changelog.png
---

## June 2026

- **DeviceSDK is now free, open-source, and self-hosted.** The managed cloud has been replaced by a server you run yourself. Everything — REST API, device & watcher WebSockets, and the dashboard — is now a single **Bun** process on one port (default `8080`), distributed as a multi-arch **Docker image** (`ghcr.io/device-sdk/devicesdk`) that runs on a Raspberry Pi, NUC, NAS, or any Docker host. All state (SQLite database, device scripts, firmware) lives under a `/data` volume you control.
  - **Open source under AGPL-3.0.** See the [LICENSE](https://github.com/device-sdk) in the repository.
  - **Install:** `docker compose up -d`, open `http://localhost:8080`, and the first account you register becomes the admin. Set `ALLOW_REGISTRATION=false` to close sign-ups afterwards.
  - **Local accounts** — register/login with email + password on the dashboard your server serves. Google sign-in and the hosted dashboard are gone.
  - **CLI now targets your server.** There is no default API URL: run `devicesdk login --host http://<server>:8080` (credentials are saved to `~/.devicesdk/credentials.json`). For CI, set `DEVICESDK_TOKEN`.
  - **Devices connect on your LAN** — firmware uses plain `ws://<server>:8080` when the host has an explicit port, and TLS on 443 for bare hostnames. Firmware binaries ship via rolling GitHub Releases and are bundled into the Docker image.
  - **No telemetry, no phone-home, no billing.** Your data never leaves your hardware.

## May 2026

- **`@devicesdk/mcp` (new)** — Model Context Protocol stdio server that exposes 7 DeviceSDK tools to AI coding agents (Claude Desktop, Claude Code, Cursor, Continue.dev, Windsurf). See [`/docs/mcp/`](/docs/mcp/) for install snippets per host.
- **AI-agent friendliness pass:**
  - `devicesdk init` now scaffolds `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/devicesdk.mdc`, `.mcp.json`, and a project `README.md`.
  - `@devicesdk/core` ships `AGENTS.md` and the full `docs/` folder inside the npm tarball; JSDoc with runnable `@example` blocks added to every method on `DeviceSenderInterface`.
  - Public docs site now publishes [`/llms.txt`](/llms.txt), [`/llms-full.txt`](/llms-full.txt), and per-page Markdown mirrors at `<page-url>/index.md`.
  - CLI commands gained a `--json` flag (`whoami`, `status`, `logs`, `env list`, `env set`, `env unset`, `deploy`); `logs --tail --json` emits NDJSON. `DEVICESDK_OUTPUT=json` works as a global toggle.
  - Auth errors now carry stable `code` and `docs` fields. See the new [error reference](/docs/errors/).
  - Branded ID types (`ProjectId`, `DeviceId`, …), an `OnboardLED` constant, and literal-union pin types (`PicoGpioPin`, `Esp32C3GpioPin`, …) added to `@devicesdk/core` for type-safer device code.
  - `DeviceSender` now validates pin/range/I2C/SPI/UART/WS2812 arguments synchronously — bad calls throw a typed error (`code: "invalid_argument"`) with a `docs` URL instead of silently round-tripping.
  - New cookbook at [`/docs/recipes/`](/docs/recipes/) with 10 task-shaped recipes.
  - URL change: `/docs/resources/changelog/` is now `/docs/changelog/` (the old URL 301s).
- **Removed:** the deprecated SSE log stream endpoint (`GET /logs/stream`). Use the [watch WebSocket](/docs/guides/real-time-watch/) instead — the dashboard, CLI, and Home Assistant integration already do.

## April 11, 2026

- **Home Assistant integration** — expose DeviceSDK devices as native Home Assistant entities (sensors, switches, lights). Declare entities in `devicesdk.ts` under `ha.entities`; run `devicesdk deploy` to publish them. See the [Home Assistant guide](/docs/guides/home-assistant/).
- **Generic watch WebSocket** — new `GET /v1/projects/:projectId/devices/:deviceId/watch` endpoint delivers real-time status, log, and structured state events over a persistent WebSocket connection. The dashboard now uses this endpoint in place of the legacy SSE log stream. See the [Real-Time Watch guide](/docs/guides/real-time-watch/).
- **`emitState` SDK method** — publish structured state values from device scripts with `this.env.DEVICE.emitState(entity_id, value)`. Feeds custom telemetry into Home Assistant entities. See the [Emit State concept](/docs/concepts/emit-state/).
- SSE log stream endpoint (`GET /logs/stream`) is deprecated in favor of the watch WebSocket.

## December 27, 2025

- Private Beta milestone: expanded access and onboarding for early teams
- Pico W and Pico 2W are the officially supported hardware targets
- ESP32 support tracked as next hardware platform
