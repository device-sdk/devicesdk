---
title: MCP server (built into DeviceSDK)
description: Connect any MCP-aware AI agent to your DeviceSDK server over HTTP - no install, OAuth or API-token auth, offline docs search
weight: 28
social_image: /og-images/docs/mcp.png
---

The DeviceSDK server exposes [Model Context Protocol](https://modelcontextprotocol.io/) tools directly at `/mcp` - list projects and devices, check connection status, read metrics, manage env vars, upload and deploy scripts, send hardware commands, search the docs. There is nothing to install: any MCP-aware agent that speaks Streamable HTTP can point straight at your server.

`/mcp` is stateless (no session to keep alive, no extra process to run) and version-matched to your server - the tools and the docs search index always reflect exactly what your server runs, not whatever the latest npm release happens to say.

## Quickstart

If you ran `devicesdk init` recently, you already have a `.mcp.json` in your project pointing at your server:

```json
{
  "mcpServers": {
    "devicesdk": {
      "type": "http",
      "url": "http://devicesdk.local:8080/mcp"
    }
  }
}
```

For an existing project, drop that into `.mcp.json` at the project root - swap in your server's actual host if `devicesdk.local` doesn't resolve on your network (see [mDNS](#mdns) below). Claude Code and Cursor both read this same `mcpServers` block automatically.

### Claude Code

```bash
claude mcp add --transport http devicesdk http://devicesdk.local:8080/mcp
```

Or rely on the project's `.mcp.json` above - Claude Code reads it automatically on session start.

### Cursor

Cursor reads the same `.mcp.json` (project root) or a global `~/.cursor/mcp.json`. Cursor infers the HTTP transport from the presence of `url` - the `type` field above is harmless but not required:

```json
{
  "mcpServers": {
    "devicesdk": {
      "url": "http://devicesdk.local:8080/mcp"
    }
  }
}
```

### VS Code

VS Code uses a different file and root key - `.vscode/mcp.json`, with `servers` instead of `mcpServers`:

```json
{
  "servers": {
    "devicesdk": {
      "type": "http",
      "url": "http://devicesdk.local:8080/mcp"
    }
  }
}
```

### OpenCode

Add to `opencode.json` (project root) or `~/.config/opencode/opencode.json` (global):

```json
{
  "mcp": {
    "devicesdk": {
      "type": "remote",
      "url": "http://devicesdk.local:8080/mcp",
      "enabled": true
    }
  }
}
```

### Other hosts

Any MCP-aware client that supports the Streamable HTTP transport will work - point it at `http://<your-server>/mcp` and check your host's docs for its remote-server config syntax.

## Authentication

### OAuth (recommended)

The first connection triggers OAuth automatically: your MCP host opens a browser, you log into the DeviceSDK dashboard if you aren't already, and a consent screen asks you to approve access for that client. Approving mints an API token - visible and revocable anytime in the dashboard's **Tokens** page - that expires automatically after 30 days. When it expires, the host simply re-prompts for consent; there's no refresh token to manage or lose track of.

Hosts with native MCP OAuth support (Claude Code, Cursor, VS Code, OpenCode, and others) handle the whole flow without any extra configuration - the plain `.mcp.json` blocks above are enough.

### API token (alternative - e.g. headless setups)

If your host doesn't support OAuth, or you want a static credential (CI, headless agents, hosts without a browser), create an API token in the dashboard's Tokens page - unlike OAuth-minted tokens, these never expire - and pass it as a Bearer header:

```json
{
  "mcpServers": {
    "devicesdk": {
      "type": "http",
      "url": "http://devicesdk.local:8080/mcp",
      "headers": { "Authorization": "Bearer <your-api-token>" }
    }
  }
}
```

**Troubleshooting**: some MCP hosts refuse to run OAuth discovery against a plain-`http://` (non-TLS) authorization server unless the host is `localhost`. If the OAuth prompt never appears against a LAN server, use the Bearer-header method above, or put the server behind TLS.

## Tools

| Tool | What it does |
|------|---|
| `devicesdk_whoami` | Show the currently-authenticated user (id, email, name, limits, usage). |
| `devicesdk_list_projects` | List every project owned by the caller. |
| `devicesdk_list_devices` | List devices in a project. |
| `devicesdk_device_status` | Live connection status for a device (connected, connected_since, current script version). |
| `devicesdk_device_metrics` | Time-bucketed usage metrics (messages, bytes, cron fires) for a device. |
| `devicesdk_project_metrics` | Aggregated usage metrics across every device in a project. |
| `devicesdk_env_list` | List env var keys for a project. The API never returns values, so neither does this tool. |
| `devicesdk_env_set` | Set one or more env vars on a project. |
| `devicesdk_env_delete` | Delete a single env var. |
| `devicesdk_list_script_versions` | List uploaded script versions for a device, flagging the current one. |
| `devicesdk_upload_script` | Upload a new script version and deploy it immediately. |
| `devicesdk_deploy_version` | Activate a previously-uploaded version (rollback or promote). |
| `devicesdk_send_command` | Send a hardware command (GPIO, I2C, SPI, UART, display, reboot, ...) to a connected device and wait for its response. |
| `devicesdk_device_logs` | Point-in-time page of persisted device logs, newest first, with cursor pagination and level filtering. For live tailing, use the dashboard's log view (backed by the watcher WebSocket) instead. |
| `devicesdk_docs_search` | Full-text search over an **offline** copy of these docs matching your server's version - no internet call, so results can lag the live site until your server image is updated. |

Every tool returns the same `{ success, result | error, code? }` shape the REST API does; the MCP result's `isError` mirrors `success`.

**Building and deploying TypeScript stays in the CLI.** The server cannot bundle a local TypeScript project - `devicesdk_upload_script` takes already-bundled JavaScript. Run `devicesdk build` / `devicesdk deploy` (or have the agent run them) for anything that starts from `devicesdk.ts` and `src/devices/*.ts`.

## mDNS

`devicesdk.local` resolves automatically when your agent host and DeviceSDK server share a LAN and the client OS supports mDNS/Bonjour (macOS and most Linux desktops out of the box; Windows usually needs Bonjour installed). If it doesn't resolve, use the server's IP address or a real hostname instead.

## Troubleshooting

- **Every tool call returns 401 / `missing_credentials`.** The OAuth flow hasn't completed, or the token was revoked. Re-trigger your host's OAuth flow, or switch to a dashboard-created API token (see above).
- **The OAuth consent screen never appears.** See the plain-HTTP note under Authentication above.
- **Tools list shows up empty, or shows stale tools after a server upgrade.** Some hosts cache the tool catalog. Restart the agent / reload the workspace.
- **`devicesdk_upload_script` fails with a validation error.** It expects already-bundled JavaScript, not raw TypeScript - build first (`devicesdk build`) and pass the bundle content.

## What MCP is, in two sentences

[Model Context Protocol](https://modelcontextprotocol.io/) is a standard for exposing typed tools and resources to LLMs. Most modern coding agents speak it natively; pointing one at `/mcp` is the same shape of integration as connecting it to Stripe, Linear, or any other MCP server - just self-hosted, alongside your devices.

## See also

- [`devicesdk init`](/docs/cli/init/) - scaffolds `.mcp.json` for new projects.
- [Cookbook](/docs/recipes/) - task-shaped recipes an agent can crib from.
- [Error reference](/docs/errors/) - the codes REST responses (and therefore MCP tool results) surface.
- [Self-hosting guide](/docs/guides/self-hosting/) - TLS, `MDNS_HOSTNAME`, and other server config that affects how agents reach `/mcp`.
- [Agent skills manifest](/.well-known/agent-skills/index.json) - for hosts that consume the [agentskills.io](https://schemas.agentskills.io/) discovery schema.
