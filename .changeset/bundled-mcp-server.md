---
'@devicesdk/server': minor
'@devicesdk/cli': minor
'@devicesdk/website': patch
---

Add a stateless Streamable-HTTP MCP server bundled into `@devicesdk/server` at `/mcp` - 15 tools covering projects, devices, env vars, script versions, commands, and offline docs search, authenticated via OAuth 2.1 (PKCE + dynamic client registration) or existing API tokens. Every tool re-enters the REST API in-process so behavior always matches the server's own version.

This replaces the standalone `@devicesdk/mcp` npm package, which is removed - `devicesdk init` now scaffolds `.mcp.json` pointing at the server's own `/mcp` endpoint instead of `npx @devicesdk/mcp`. The docs site's MCP page is rewritten to match.
