---
title: CLI Reference
description: Complete command-line interface reference for DeviceSDK
social_image: /og-images/docs/cli.png
---

## Installation

Install the CLI via npm:

```bash
npm install -g @devicesdk/cli
```

Or use it directly with npx:

```bash
npx @devicesdk/cli [command]
```

## Configuration

The CLI is configured through `devicesdk.ts` in your project root:

```typescript
export default {
  devices: {
    'my-device': './src/devices/my-device.ts'
  }
}
```

Most commands auto-discover this file by walking up from the current directory, so they work from any subdirectory of your project. The keys under `devices` are **device slugs** and the top-level `projectId` is the **project slug** — see [Project & Device Identifiers](/docs/concepts/identifiers/) for the conventions.

## Global Flags

All commands support these global flags:

- `--config <path>` - Path to config file (default: `devicesdk.ts`)
- `--verbose` - Enable verbose logging
- `--help` - Show help for a command

## Environment Variables

- `DEVICESDK_TOKEN` - API token (`dsdk_…`) from your dashboard's Tokens page; checked before the saved credentials, ideal for CI
- `DEVICESDK_API_URL` - URL of the DeviceSDK server to target. There is no default — it overrides the host saved by `devicesdk login --host <url>`

The CLI has **no built-in server URL**. Set it once with `devicesdk login --host http://<server>:8080`, or per-command with `DEVICESDK_API_URL`. See [`devicesdk login`](/docs/cli/login/).

## Available Commands

### Development
- [**devicesdk init**](/docs/cli/init/) - Create a new project

### Deployment
- [**devicesdk deploy**](/docs/cli/deploy/) - Deploy scripts to your server
- [**devicesdk flash**](/docs/cli/flash/) - Flash firmware to device

### Monitoring
- [**devicesdk status**](/docs/cli/status/) - Check device connection status
- [**devicesdk inspect**](/docs/cli/inspect/) - Interactive hardware REPL

### Configuration
- [**devicesdk env**](/docs/concepts/env-vars/) - Manage project environment variables

### Debugging
- [**devicesdk logs**](/docs/cli/logs/) - View and stream device logs

## Getting Help

Run any command with `--help` to see detailed usage:

```bash
npx @devicesdk/cli deploy --help
```

## Exit Codes

The CLI uses stable numeric exit codes so scripts and CI pipelines can dispatch on failure type. These values will not be renumbered — new categories get new values.

| Code | Name               | Meaning                                                       |
|------|--------------------|---------------------------------------------------------------|
| 0    | SUCCESS            | Command completed successfully                                 |
| 1    | GENERIC            | Unclassified error; treat as "retry or file a bug"             |
| 2    | CONFIG_INVALID     | Bad template, unknown/missing device, or invalid argument     |
| 3    | NOT_AUTHENTICATED  | No valid credentials; run `devicesdk login`                    |
| 4    | CONFIG_LOAD_FAILED | `devicesdk.ts` is missing, unparseable, or semantically wrong |
| 5    | BUILD_ERROR        | esbuild bundling failed — check device script for TS errors    |
| 6    | DEPLOY_ERROR       | Script upload, firmware flash, or device-communication failure |
