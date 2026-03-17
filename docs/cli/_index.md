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

## Global Flags

All commands support these global flags:

- `--config <path>` - Path to config file (default: `devicesdk.ts`)
- `--verbose` - Enable verbose logging
- `--help` - Show help for a command

## Environment Variables

- `DEVICESDK_TOKEN` - API authentication token
- `DEVICESDK_API_URL` - API endpoint (default: production)

## Available Commands

### Development
- [**devicesdk init**](/docs/cli/init/) - Create a new project

### Deployment
- [**devicesdk deploy**](/docs/cli/deploy/) - Deploy to production
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
