# @devicesdk/mcp

Model Context Protocol server for DeviceSDK. Lets AI coding agents (Claude Desktop, Claude Code, Cursor, Continue.dev, etc.) drive your DeviceSDK projects: list devices, deploy scripts, flash firmware, tail logs, manage env vars.

## Install

```bash
npx -y @devicesdk/mcp --version
```

You don't usually run it directly — it's launched by your MCP-aware tool. Add this to `.mcp.json` in your project (or wherever your tool reads MCP config):

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

`devicesdk init` writes this file for you when scaffolding a new project.

## Authentication

The server inherits the CLI's auth: it reads `~/.devicesdk/auth.json` (created by `devicesdk login`). If you set `DEVICESDK_TOKEN` in the environment, that takes precedence — useful in CI or when you want a tighter-scoped token for your agent.

## Tools exposed

| Tool | What it does |
|------|--------------|
| `devicesdk_whoami` | Show the currently-authenticated user. |
| `devicesdk_status` | List devices in a project with their connection state. |
| `devicesdk_logs_tail` | Fetch the last N log entries for a device. |
| `devicesdk_env_list` | List env var keys for a project (values never returned). |
| `devicesdk_env_set` | Set one or more env vars on a project. |
| `devicesdk_deploy` | Build + deploy device scripts. |
| `devicesdk_docs_search` | Resolve a query to a docs URL on devicesdk.com. |

Each tool wraps the equivalent `devicesdk <cmd> --json` invocation, so the agent gets the same `{ success, result | error }` shape returned by the CLI.

## See also

- [`devicesdk init`](https://devicesdk.com/docs/cli/init/) — scaffolds a project with `.mcp.json` preconfigured.
- [Cookbook](https://devicesdk.com/docs/recipes/) — task-shaped recipes.
- [`@devicesdk/cli`](https://www.npmjs.com/package/@devicesdk/cli) — the CLI this server wraps.
