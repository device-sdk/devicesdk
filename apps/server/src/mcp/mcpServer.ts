import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../../package.json" with { type: "json" };
import { registerTools, type ToolDeps } from "./tools";

/**
 * Builds a fresh MCP server instance wired to the given loopback. Called once
 * per /mcp request (see route.ts) - the server is stateless, so there is no
 * benefit to reusing an instance across requests and every benefit (no shared
 * mutable state between callers) to not doing so.
 */
export function buildMcpServer(deps: ToolDeps): McpServer {
	const server = new McpServer({ name: "devicesdk", version: pkg.version });
	registerTools(server, deps);
	return server;
}
