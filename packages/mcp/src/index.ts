#!/usr/bin/env node

/**
 * @devicesdk/mcp - Model Context Protocol stdio server.
 *
 * Wraps the `devicesdk` CLI's --json modes as MCP tools so AI coding agents
 * (Claude Code, Cursor, Continue.dev, …) can interact with DeviceSDK projects
 * without learning the shell. Inherits auth from `~/.devicesdk/auth.json`.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { execa } from "execa";

interface CliResult {
	success: boolean;
	result?: unknown;
	error?: string;
	code?: string;
	docs?: string;
}

async function runCli(args: string[]): Promise<CliResult> {
	try {
		// We pass DEVICESDK_OUTPUT=json instead of appending --json so the call
		// works for every subcommand uniformly - including the ones (`env set`,
		// `env unset`, `deploy`) that don't declare a `--json` flag and would
		// otherwise be rejected by Commander as an unknown option.
		const { stdout } = await execa("devicesdk", args, {
			env: { ...process.env, DEVICESDK_OUTPUT: "json" },
			reject: false,
		});
		const trimmed = stdout.trim();
		if (!trimmed) {
			return { success: false, error: "CLI returned no output" };
		}
		// In NDJSON streaming modes (logs --tail --json) only the first frame
		// matters for one-shot tool calls; we strip to the last newline-bounded
		// JSON record to keep the tool deterministic.
		const lastLine = trimmed.split("\n").filter(Boolean).at(-1) ?? trimmed;
		try {
			return JSON.parse(lastLine) as CliResult;
		} catch {
			return {
				success: false,
				error: `Invalid JSON from CLI: ${lastLine.slice(0, 200)}`,
			};
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, error: `Failed to spawn devicesdk: ${message}` };
	}
}

function asToolResponse(result: CliResult) {
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(result, null, 2),
			},
		],
		isError: !result.success,
	};
}

const TOOLS: Tool[] = [
	{
		name: "devicesdk_whoami",
		description:
			"Show the currently-authenticated DeviceSDK user. Returns { id, email }.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "devicesdk_status",
		description:
			"List devices in a DeviceSDK project with their connection status. " +
			"Project ID defaults to the one in `devicesdk.ts` in the current working directory.",
		inputSchema: {
			type: "object",
			properties: {
				project: {
					type: "string",
					description: "Project ID (overrides devicesdk.ts).",
				},
				device: {
					type: "string",
					description: "Restrict to a single device by ID.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "devicesdk_logs_tail",
		description:
			"Fetch the most recent log entries for a device. Returns { projectId, deviceId, entries[] }.",
		inputSchema: {
			type: "object",
			properties: {
				project: { type: "string" },
				device: { type: "string" },
				lines: {
					type: "number",
					description: "Number of entries to return (max 100, default 50).",
				},
				level: {
					type: "string",
					enum: ["log", "info", "warn", "error", "debug"],
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "devicesdk_env_list",
		description:
			"List env var keys for a project. Values are never returned by the API for security reasons.",
		inputSchema: {
			type: "object",
			properties: {
				project: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "devicesdk_env_set",
		description:
			"Set one or more env vars on a project. The values are visible only to the device script via `this.env.VARS`.",
		inputSchema: {
			type: "object",
			properties: {
				project: { type: "string" },
				pairs: {
					type: "array",
					items: { type: "string" },
					description:
						'KEY=VALUE strings, e.g. ["DISCORD_WEBHOOK=https://..."].',
				},
			},
			required: ["pairs"],
			additionalProperties: false,
		},
	},
	{
		name: "devicesdk_deploy",
		description:
			"Build and deploy device scripts. Run from a directory containing `devicesdk.ts`.",
		inputSchema: {
			type: "object",
			properties: {
				device: {
					type: "string",
					description: "Deploy only one device (defaults to all).",
				},
				message: {
					type: "string",
					description: "Deployment message / version note.",
				},
				dryRun: {
					type: "boolean",
					description: "Validate without uploading.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "devicesdk_docs_search",
		description:
			"Resolve a free-text query to the most relevant docs URL on devicesdk.com. Use to point an agent at canonical references for further reading.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string" },
			},
			required: ["query"],
			additionalProperties: false,
		},
	},
];

const server = new Server(
	{ name: "devicesdk-mcp", version: "0.1.0" },
	{ capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;
	const a = (args ?? {}) as Record<string, unknown>;

	switch (name) {
		case "devicesdk_whoami":
			return asToolResponse(await runCli(["whoami"]));

		case "devicesdk_status": {
			const argv = ["status"];
			if (typeof a.project === "string") argv.push("--project", a.project);
			if (typeof a.device === "string") argv.push("--device", a.device);
			return asToolResponse(await runCli(argv));
		}

		case "devicesdk_logs_tail": {
			const argv = ["logs"];
			if (typeof a.project === "string") argv.push(a.project);
			if (typeof a.device === "string") argv.push(a.device);
			if (typeof a.lines === "number") argv.push("--lines", String(a.lines));
			if (typeof a.level === "string") argv.push("--level", a.level);
			return asToolResponse(await runCli(argv));
		}

		case "devicesdk_env_list": {
			const argv = ["env", "list"];
			if (typeof a.project === "string") argv.push("--project", a.project);
			return asToolResponse(await runCli(argv));
		}

		case "devicesdk_env_set": {
			const pairs = Array.isArray(a.pairs) ? (a.pairs as string[]) : [];
			if (pairs.length === 0) {
				return asToolResponse({
					success: false,
					error: "Pass at least one KEY=VALUE pair.",
					code: "missing_pairs",
				});
			}
			const argv = ["env", "set", ...pairs];
			if (typeof a.project === "string") argv.push("--project", a.project);
			return asToolResponse(await runCli(argv));
		}

		case "devicesdk_deploy": {
			const argv = ["deploy"];
			if (typeof a.device === "string") argv.push("--device", a.device);
			if (typeof a.message === "string") argv.push("-m", a.message);
			if (a.dryRun === true) argv.push("--dry-run");
			return asToolResponse(await runCli(argv));
		}

		case "devicesdk_docs_search": {
			// Lightweight search: fetch /llms.txt and grep for the query. The
			// llms.txt is a curated index, so the first hit is usually the right
			// page. Avoids depending on a separate search index.
			const query = typeof a.query === "string" ? a.query.toLowerCase() : "";
			if (!query) {
				return asToolResponse({
					success: false,
					error: "query is required",
					code: "missing_query",
				});
			}
			try {
				const res = await fetch("https://devicesdk.com/llms.txt");
				if (!res.ok) {
					return asToolResponse({
						success: false,
						error: `llms.txt fetch failed: ${res.status}`,
					});
				}
				const text = await res.text();
				const matches = text
					.split("\n")
					.filter((line) => line.toLowerCase().includes(query))
					.slice(0, 10);
				return asToolResponse({
					success: true,
					result: { query, matches },
				});
			} catch (err) {
				return asToolResponse({
					success: false,
					error: `docs search failed: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		}

		default:
			return asToolResponse({
				success: false,
				error: `Unknown tool: ${name}`,
				code: "unknown_tool",
			});
	}
});

const transport = new StdioServerTransport();
await server.connect(transport);
