---
title: devicesdk dev
description: Run the local development simulator for DeviceSDK device scripts
social_image: /og-images/docs/cli/dev.png
---

## Usage

```bash
devicesdk dev [flags]
```

## Flags

- `-c, --config <path>` - Path to the `devicesdk.ts` config file (defaults to `./devicesdk.ts`).
- `-p, --port <port>` - Port for the dev server (default: `8181`).

## Description

`devicesdk dev` starts a local simulator that loads your `devicesdk.ts`, bundles your device scripts with esbuild, and runs them in a browser-based simulator at `http://localhost:8181`. Useful for iterating on a device script without flashing a real board on every change.

The simulator wires up:

- A pretend GPIO/PWM/ADC bus you can drive from the UI.
- An I2C bus mock with the bundled SSD1306 OLED + BME280 sensor stubs.
- Live reload - saving a `src/devices/*.ts` rebuilds and reloads.
- Console output piped to your terminal.

## What the simulator can't do

- Real hardware peripherals not yet supported in the simulator (notably PIO/WS2812 strips). For those, deploy and flash a real board.
- Inter-device RPC across a real fleet - the simulator runs one device at a time.
- Cron triggers - for those, deploy and rely on the actual cron scheduler.

## Examples

```bash
# Default: read ./devicesdk.ts, serve on :8181
devicesdk dev

# Custom port
devicesdk dev --port 3000

# Custom config
devicesdk dev --config ./devicesdk.dev.ts
```

## Related

- [`devicesdk build`](/docs/cli/build/) - bundle without serving the simulator.
- [`devicesdk deploy`](/docs/cli/deploy/) - push to your server.
- [`devicesdk inspect`](/docs/cli/inspect/) - drive a *real* device interactively.
