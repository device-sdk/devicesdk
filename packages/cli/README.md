# @devicesdk/cli — DeviceSDK CLI

Build, run, deploy, and flash DeviceSDK IoT projects from the command line.

## Install

```bash
npm install -g @devicesdk/cli
# or with pnpm
pnpm add -g @devicesdk/cli
```

Or run on-demand: `npx @devicesdk/cli --help`

## Quick start
```bash
devicesdk login
devicesdk init               # creates devicesdk.ts
devicesdk build              # outputs to .devicesdk/build
devicesdk dev                # local simulator (workerd)
devicesdk deploy             # build + upload
devicesdk flash <deviceId>   # Pico BOOTSEL flash
```

## Project config (`devicesdk.ts`)
```ts
import { defineConfig } from '@devicesdk/cli';

export default defineConfig({
  projectId: 'my-project',
  devices: {
    'pico-1': {
      main: './src/device.ts',     // path to your script
      className: 'MyDevice',        // named export from `main`
      deviceType: 'pico-w',
      name: 'My Pico',
      description: 'Demo device',
      wifi: { ssid: 'MyWiFi', password: 'secret' },
    },
  },
});
```
- `main` is the file path; `className` is the exported class name (must be `export class <name> extends DeviceEntrypoint`, not `export default class`).
- Use `--config` or `DEVICESDK_CONFIG` to point to a custom config path.

## Key commands
- `login` / `logout` / `whoami` — authenticate via device code flow (tokens in `~/.devicesdk/credentials.json`).
- `init` — scaffold a config.
- `build` — esbuild (ESM, es2022, unbundled) into `.devicesdk/build`.
- `dev` — builds and runs the local simulator; picks a dynamic port if 8181 is busy.
- `deploy` — builds and uploads scripts; creates the project if missing.
- `flash` — downloads firmware and copies to a Raspberry Pi Pico in BOOTSEL mode; looks for volumes `RPI-RP2` or `RP2350`. Firmware is saved to `<project>/.devicesdk/firmware/<deviceId>.uf2` before flashing (default timeout 2 minutes).

Run `devicesdk --help` or `devicesdk <command> --help` for full options.

## Troubleshooting
- Config not found: pass `-c/--config` or set `DEVICESDK_CONFIG`.
- Flashing: ensure BOOTSEL volume is `RPI-RP2` or `RP2350`; confirm UF2 contents if nothing changes on reboot.
- Build errors: verify the `main` path and TypeScript output (non-bundled esbuild).
