# AGENTS.md - `examples/`

**Work in this folder from the end-user's perspective, not the SDK maintainer's.**

Everything under `examples/` is a standalone project that a customer would copy
and run. When a task here involves running, deploying, or flashing an example,
behave exactly as a customer would: drive everything through the public
`devicesdk` CLI as a black box. Do **not** reach into monorepo internals
(editing `packages/cli`, calling the API by hand, patching firmware, bypassing
auth) to make an example work - if the end-user path is broken, that is itself
the bug to report, not something to route around.

## The end-user flow

Run these from inside the specific example directory (e.g.
`examples/esp32c3-clock`):

1. **Install the CLI.** `pnpm install` (the example declares `@devicesdk/cli` as
   a dep). `pnpm exec devicesdk …` / the `pnpm <script>` shortcuts then run it.
2. **Check auth.** `pnpm exec devicesdk whoami`. If it reports you're not logged
   in, move to step 3; otherwise skip it.
3. **Log in.** `devicesdk login --host http://localhost:8080` prompts for the
   local admin email and password you created on the server. Ask the user to
   run it themselves with `! devicesdk login --host http://localhost:8080` (or
   set `DEVICESDK_API_URL` / `DEVICESDK_TOKEN` for a non-interactive token),
   then continue.
4. **Configure.** Set real WiFi credentials (and any other config) in
   `devicesdk.ts` / the device script. **Never commit real secrets** - restore
   the `YOUR_WIFI_*` placeholders before any commit.
5. **Deploy.** `pnpm deploy` (`devicesdk deploy`) uploads the device script.
6. **Flash.** `pnpm flash-remote` (`devicesdk flash <device>`). Pico flashes over
   the BOOTSEL mass-storage volume; ESP32 flashes over serial via `esptool`
   (must be on PATH). The CLI downloads firmware with the WiFi/token baked in
   and writes it to the board.

## Conventions

- `DEVICESDK_API_URL` overrides the API endpoint; unset, the CLI uses the host
  saved in `~/.devicesdk/credentials.json`. The `local:*` / `flash-local`
  scripts point at `localhost:8080` for SDK contributors.
- Examples are **not versioned** - they need no changeset entry (a PR that only
  touches `examples/` still needs an *empty* changeset to satisfy the CI gate;
  see root AGENTS.md).
- Keep secrets out of git: WiFi creds, tokens, and `DEVICESDK_TOKEN` never get
  committed.
