---
title: devicesdk build
description: Bundle device scripts and regenerate inter-device RPC types
social_image: /og-images/docs/cli/build.png
---

## Usage

```bash
devicesdk build [flags]
```

## Flags

- `-d, --device <id>` - Build only one device.
- `-o, --outdir <path>` - Output directory (default: `.devicesdk/build`).
- `--minify` - Minify the output.
- `--sourcemap` - Generate source maps.
- `-c, --config <path>` - Path to the `devicesdk.ts` config file.

## Description

`devicesdk build` does two things:

1. **Generates `devicesdk-env.d.ts`** alongside `devicesdk.ts`. This file contains type-safe inter-device RPC types based on the device map in `devicesdk.ts` - so `await this.env.DEVICES["sensor-1"].method()` autocompletes correctly. Re-run `build` after any change to the `devices` block.
2. **Bundles each device's `main` file** with esbuild (ESM, ES2022 target) into `.devicesdk/build/<device-id>.js`. Bundles must be under 1 MB.

`devicesdk dev` and `devicesdk deploy` both run `build` automatically; you only need to call it explicitly when you want to inspect the output or pre-warm the type generation in CI.

## Common errors

- **`Class "X" must be exported as a named export`** - your device file has `export default class X`. Change to `export class X`.
- **`Main file not found`** - the `main` path in `devicesdk.ts` is wrong. The path is relative to `devicesdk.ts` itself.
- **`Script exceeds maximum size of 1MB`** - the bundle is too large. Remove unnecessary deps and check that you're not bundling Node-only packages.

## Examples

```bash
# Build all devices
devicesdk build

# Build just one
devicesdk build --device thermostat --minify

# Build to a custom location
devicesdk build --outdir dist/ --sourcemap
```

## Related

- [`devicesdk deploy`](/docs/cli/deploy/) - push the build to your server.
- [`devicesdk dev`](/docs/cli/dev/) - run the simulator (calls `build` internally).
- [Device entrypoints](/docs/concepts/entrypoints/) - what your `main` file should look like.
