---
title: devicesdk init
description: Create a new DeviceSDK project
social_image: /og-images/docs/cli/init.png
---

## Usage

```bash
devicesdk init [project-name] [flags]
```

## Arguments

- `project-name` - Name of the project directory to create

## Flags

- `--yes, -y` - Skip interactive prompts and use defaults
- `--template <name>` - Use a specific template (basic, multi-device, empty)
- `--name <name>` - Project name (if directory name differs)

## Description

Creates a new project directory with:
- `devicesdk.ts` — project configuration
- `src/devices/` — device entrypoint directory
- Example device code that uses `DeviceResponse`-typed `onMessage`
- `tsconfig.json` (strict) and `package.json`
- `.gitignore`
- `AGENTS.md` — version-matched guidance for AI coding agents working in the project
- `CLAUDE.md` — one-line `@AGENTS.md` reference for Claude Code
- `.cursor/rules/devicesdk.mdc` — Cursor rules pointing at `AGENTS.md`
- `.mcp.json` — preconfigures the `@devicesdk/mcp` server for MCP-aware agents
- `README.md` — quick reference for humans

## Interactive Mode

By default, `init` runs interactively:

```bash
devicesdk init my-project
```

You'll be prompted for:
- Project name
- Template selection
- Initial device name

## Templates

### Basic (Default)
Single device with LED blink example:
```bash
devicesdk init my-project --template basic
```

### Multi-Device
Multiple device entrypoints:
```bash
devicesdk init my-project --template multi-device
```

### Empty
Minimal setup with no example code:
```bash
devicesdk init my-project --template empty
```

## Examples

Create with defaults:
```bash
devicesdk init my-iot-app --yes
```

Create with specific template:
```bash
devicesdk init sensor-network --template multi-device
```

Create in current directory:
```bash
mkdir my-project && cd my-project
devicesdk init . --yes
```

## Project Structure

After running `init`, your project will look like:

```
my-project/
├── devicesdk.ts          # Configuration
├── src/
│   └── devices/
│       └── my-device.ts  # Device entrypoint
├── AGENTS.md             # AI-agent guidance
├── CLAUDE.md             # @AGENTS.md (Claude Code reference)
├── .cursor/
│   └── rules/
│       └── devicesdk.mdc # Cursor rules
├── .mcp.json             # MCP config (preconfigures @devicesdk/mcp)
├── README.md             # Human-facing readme
├── .devicesdk/           # Build output (generated)
├── tsconfig.json
├── package.json
└── .gitignore
```

## Next Steps

After creating a project:

1. Navigate into the directory:
   ```bash
   cd my-project
   ```

2. Make changes and deploy:
   ```bash
   devicesdk deploy
   ```

## Related Commands

- [devicesdk deploy](/docs/cli/deploy/) - Deploy your project
