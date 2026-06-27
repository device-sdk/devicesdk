---
title: MCP server (@devicesdk/mcp)
description: Drive DeviceSDK from OpenCode, Claude, Cursor, Continue, Windsurf and other MCP-aware coding agents
weight: 28
social_image: /og-images/docs/mcp.png
---

`@devicesdk/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes DeviceSDK as a set of tools your AI agent can call directly - list devices, deploy scripts, tail logs, set env vars, search the docs. The agent never has to learn the shell.

Because it wraps the CLI, it talks to whatever DeviceSDK server the CLI is configured against - the self-hosted server you authenticated against with `devicesdk login` (the CLI auto-discovers it via mDNS, or you can pass `--host <url>`). There is no managed cloud.

It's a thin wrapper over the `devicesdk` CLI's `--json` mode, so you get the same auth, the same error messages, and the same `{ success, result | error, code, docs }` shape the API returns.

## Quickstart

If you ran `devicesdk init` recently, you already have a `.mcp.json` in your project pointing at `@devicesdk/mcp` - open the project in any MCP-aware tool and it just works.

For an existing project, drop this into a `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "devicesdk": {
      "command": "npx",
      "args": ["-y", "@devicesdk/mcp"]
    }
  }
}
```

Then reload your agent and run `devicesdk login` once so the MCP server can find your auth token and server URL. The CLI auto-discovers your server via mDNS; if that doesn't work on your network, pass `--host http://<server>:8080`.

## Install per host

### Claude Code

If you use Claude Code in a project that has `.mcp.json`, the server registers automatically on session start. To register globally instead:

```bash
claude mcp add devicesdk -- npx -y @devicesdk/mcp
```

### OpenCode

OpenCode reads `.mcp.json` from the project root automatically. To register the server globally, add it to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "devicesdk": {
      "type": "local",
      "command": ["npx", "-y", "@devicesdk/mcp"]
    }
  }
}
```

Restart OpenCode for the config change to take effect.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "devicesdk": {
      "command": "npx",
      "args": ["-y", "@devicesdk/mcp"]
    }
  }
}
```

Restart Claude Desktop. The DeviceSDK tools appear in the 🔨 picker.

### Cursor

Cursor reads `.mcp.json` from the project root (same shape as above). It also supports a global `~/.cursor/mcp.json`. Reload the workspace after adding.

### Continue.dev

Add to your `~/.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "@devicesdk/mcp"]
        }
      }
    ]
  }
}
```

### Windsurf, Zed, JetBrains Junie, others

Any MCP-aware client that accepts a stdio server with a `command` + `args` will work. Use the same `npx -y @devicesdk/mcp` invocation.

## Authentication

The MCP server inherits the CLI's authentication. In order of precedence:

1. **`DEVICESDK_TOKEN`** environment variable - a `dsdk_…` token, best for CI or when you want a tighter-scoped token for the agent than for your CLI. Pair it with `DEVICESDK_API_URL` to point at your server.
2. **`~/.devicesdk/credentials.json`** - written by `devicesdk login` (with or without `--host`); stores both the tokens and the server host. Refresh tokens rotate automatically.

If neither is present, every tool returns `{ success: false, code: "missing_credentials", docs: "..." }`.

To scope an agent more tightly, generate a token in the dashboard's *Tokens* page and pass it through your MCP host's environment. For Claude Desktop, that means adding an `env` block in the config:

```json
{
  "mcpServers": {
    "devicesdk": {
      "command": "npx",
      "args": ["-y", "@devicesdk/mcp"],
      "env": { "DEVICESDK_TOKEN": "dsdk_…" }
    }
  }
}
```

## Tools

| Tool | What it does |
|------|---|
| `devicesdk_whoami` | Show the currently-authenticated user. |
| `devicesdk_status` | List devices in a project with their connection state, current version, and last-seen time. Defaults to the project in `devicesdk.ts` in the cwd. |
| `devicesdk_logs_tail` | Fetch the most recent N log entries for a device (max 100). Filters by level. Returns the same shape as `devicesdk logs --json`. |
| `devicesdk_env_list` | List env var keys for a project. The API never returns values, so neither does this tool - read them inside your script with `this.env.VARS.get`. |
| `devicesdk_env_set` | Set one or more `KEY=VALUE` pairs on a project. |
| `devicesdk_deploy` | Build and deploy device scripts. Supports `--dry-run` and per-device targeting. |
| `devicesdk_docs_search` | Resolve a free-text query to relevant URLs from `/llms.txt`. Use to point yourself at canonical references for further reading. |

Every tool returns `{ success, result | error, code?, docs? }`. On `success: false` the `docs` field points at the page on this site explaining the error.

## Example session

```
You: list my devices in the orchard project, then tail the last 20 errors from the broken one

Agent: [calls devicesdk_status → orchard has 4 devices: sensor-east is offline]
       [calls devicesdk_logs_tail with level=error, lines=20, project=orchard, device=sensor-east]
       sensor-east lost connectivity 14 minutes ago. The last 20 error logs show
       "BME280 not detected at 0x76" repeating every minute since 09:14 UTC. That
       error pattern matches the I2C-wiring case in /docs/recipes/read-bme280/ -
       check the SDA/SCL wires haven't come loose.
```

## Troubleshooting

- **"command not found: devicesdk"** during a tool call. The server shells out to the CLI, so the CLI must be on `PATH` (or installed via the `@devicesdk/mcp` package's bundled dependency). Run `npm install -g @devicesdk/cli` if you don't have it project-locally, or run the agent from inside a project where `devicesdk` is available via `npx`.
- **Every tool returns `missing_credentials`.** Run `devicesdk login` once, or set `DEVICESDK_TOKEN` in the MCP host's env block.
- **Tools list shows up empty.** Some hosts cache the tool catalog. Restart the agent / reload the workspace after editing `.mcp.json`.
- **Tools work but the agent doesn't pick the right one.** Drop a hint in your prompt: "use the `devicesdk_status` tool to check connectivity, then `devicesdk_logs_tail` to see why."

## What MCP is, in two sentences

[Model Context Protocol](https://modelcontextprotocol.io/) is a standard for exposing typed tools and resources to LLMs. The Anthropic-stewarded MCP registry has thousands of servers; everything from Stripe to Linear to Supabase ships one, and most modern coding agents speak it natively.

## See also

- [`devicesdk init`](/docs/cli/init/) - scaffolds `.mcp.json` for new projects.
- [Cookbook](/docs/recipes/) - task-shaped recipes the agent can crib from.
- [Error reference](/docs/errors/) - the codes the MCP tools surface.
- [Agent skills manifest](/.well-known/agent-skills/index.json) - for hosts that consume the [agentskills.io](https://schemas.agentskills.io/) discovery schema.
- npm: [`@devicesdk/mcp`](https://www.npmjs.com/package/@devicesdk/mcp), [`@devicesdk/cli`](https://www.npmjs.com/package/@devicesdk/cli)
