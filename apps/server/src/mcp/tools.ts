import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { searchDocs } from "./docsSearch";

/** Result of an in-process loopback call against the REST API. */
export interface LoopbackResult {
	status: number;
	/** Parsed JSON body, or undefined if the response wasn't JSON. */
	body: unknown;
}

/**
 * Re-enters the Hono app for a given method/path as the same authenticated
 * user that called /mcp - see `route.ts` for how this is constructed. Tools
 * never talk to the database directly; they wrap the existing REST API so
 * validation, limits, and response shapes stay in exactly one place.
 */
export type LoopbackFn = (
	method: string,
	path: string,
	opts?: {
		query?: Record<string, string | number | undefined>;
		body?: unknown;
	},
) => Promise<LoopbackResult>;

export interface ToolDeps {
	loopback: LoopbackFn;
	/** Path to the build-time SQLite FTS5 docs index (see ../config.ts). */
	docsIndexPath: string;
}

interface ApiEnvelope {
	success?: boolean;
	[key: string]: unknown;
}

/**
 * Converts a loopback REST response into an MCP tool result: the JSON body
 * pretty-printed as text content, with `isError` mirroring the REST envelope's
 * `success` flag - the same convention the retired packages/mcp stdio server
 * used (JSON.stringify(result, null, 2) + isError: !result.success).
 */
function toToolResult(result: LoopbackResult): CallToolResult {
	const body = (
		result.body === undefined || result.body === null
			? {
					success: false,
					error: `Empty or non-JSON response (HTTP ${result.status})`,
				}
			: result.body
	) as ApiEnvelope;
	return {
		content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
		isError: body.success !== true,
	};
}

// Every project/device path parameter is the URL *slug* (project_slug /
// device_slug) - the same identifiers devicesdk_list_projects /
// devicesdk_list_devices return as `project_slug` / `device_id` in their
// result payloads - NOT the internal `id` UUID also present in those list
// responses. Every description below says so explicitly so an agent doesn't
// feed a UUID and get 404s.
const projectIdParam = z
	.string()
	.min(1)
	.max(36)
	.describe(
		"Project slug (the project_slug field from devicesdk_list_projects - not the id UUID).",
	);
const deviceIdParam = z
	.string()
	.min(1)
	.max(36)
	.describe(
		"Device slug (the device_id field from devicesdk_list_devices - not the id UUID).",
	);
const windowParam = z
	.enum(["1h", "12h", "7d"])
	.optional()
	.describe(
		"Metrics time window. Defaults to 1h for a device, 12h for a project.",
	);

// Mirrors sendCommand.ts's VALID_COMMAND_TYPES. The REST endpoint remains the
// source of truth for validation (an unrecognized type still comes back as a
// clear 400 through the loopback); this local copy exists only so the tool's
// JSON schema documents the legal values to the calling agent.
const COMMAND_TYPES = [
	"set_gpio_state",
	"get_pin_state",
	"set_pwm_state",
	"set_pin_config",
	"i2c_scan",
	"i2c_read",
	"i2c_write",
	"i2c_configure",
	"i2c_batch_write",
	"display_update",
	"configure_gpio_input_monitoring",
	"reboot",
	"get_temperature",
	"watchdog_configure",
	"watchdog_feed",
	"spi_configure",
	"spi_transfer",
	"spi_write",
	"spi_read",
	"uart_configure",
	"uart_write",
	"uart_read",
	"pio_ws2812_configure",
	"pio_ws2812_update",
] as const;

/** Registers every devicesdk_* tool on `server`, wired to the given loopback. */
export function registerTools(server: McpServer, deps: ToolDeps): void {
	const { loopback, docsIndexPath } = deps;

	// --- Read-only tools -----------------------------------------------

	server.registerTool(
		"devicesdk_whoami",
		{
			title: "Who am I",
			description:
				"Show the currently-authenticated DeviceSDK user: id, email, name, plan limits, and usage.",
			inputSchema: {},
			annotations: { readOnlyHint: true, title: "Who am I" },
		},
		async () => toToolResult(await loopback("GET", "/v1/user/me")),
	);

	server.registerTool(
		"devicesdk_list_projects",
		{
			title: "List projects",
			description:
				"List every project owned by the authenticated user, paginated. Each item's " +
				"project_slug is what you pass as projectId to every other tool - id is an " +
				"internal UUID, not usable elsewhere.",
			inputSchema: {
				page: z.coerce.number().int().min(1).optional(),
				per_page: z.coerce.number().int().min(1).max(100).optional(),
			},
			annotations: { readOnlyHint: true, title: "List projects" },
		},
		async ({ page, per_page }) =>
			toToolResult(
				await loopback("GET", "/v1/projects", { query: { page, per_page } }),
			),
	);

	server.registerTool(
		"devicesdk_list_devices",
		{
			title: "List devices",
			description:
				"List devices in a project, paginated. Each item's device_id field is the " +
				"device's slug (what you pass as deviceId to other tools) - id is an internal " +
				"UUID, not usable elsewhere.",
			inputSchema: {
				projectId: projectIdParam,
				page: z.coerce.number().int().min(1).optional(),
				per_page: z.coerce.number().int().min(1).max(100).optional(),
			},
			annotations: { readOnlyHint: true, title: "List devices" },
		},
		async ({ projectId, page, per_page }) =>
			toToolResult(
				await loopback("GET", `/v1/projects/${projectId}/devices`, {
					query: { page, per_page },
				}),
			),
	);

	server.registerTool(
		"devicesdk_device_status",
		{
			title: "Device connection status",
			description:
				"Get a device's live WebSocket connection status: connected, connected_since, " +
				"last_connected_at, and the currently deployed script version.",
			inputSchema: { projectId: projectIdParam, deviceId: deviceIdParam },
			annotations: { readOnlyHint: true, title: "Device connection status" },
		},
		async ({ projectId, deviceId }) =>
			toToolResult(
				await loopback(
					"GET",
					`/v1/projects/${projectId}/devices/${deviceId}/status`,
				),
			),
	);

	server.registerTool(
		"devicesdk_device_logs",
		{
			title: "Device logs",
			description:
				"Fetch a page of persisted device logs, newest first. Optionally filter by " +
				"level and page backwards in time with the returned cursor. For live tailing, " +
				"use the watcher WebSocket (/v1/projects/:projectId/devices/:deviceId/watch) " +
				"instead - this tool is a point-in-time snapshot.",
			inputSchema: {
				projectId: projectIdParam,
				deviceId: deviceIdParam,
				cursor: z.string().optional(),
				limit: z.coerce.number().min(1).max(100).optional(),
				level: z.enum(["log", "info", "warn", "error", "debug"]).optional(),
			},
			annotations: { readOnlyHint: true, title: "Device logs" },
		},
		async ({ projectId, deviceId, cursor, limit, level }) =>
			toToolResult(
				await loopback(
					"GET",
					`/v1/projects/${projectId}/devices/${deviceId}/logs`,
					{ query: { cursor, limit, level } },
				),
			),
	);

	server.registerTool(
		"devicesdk_device_metrics",
		{
			title: "Device usage metrics",
			description:
				"Get time-bucketed usage metrics (messages, bytes, commands) for a single device.",
			inputSchema: {
				projectId: projectIdParam,
				deviceId: deviceIdParam,
				window: windowParam,
			},
			annotations: { readOnlyHint: true, title: "Device usage metrics" },
		},
		async ({ projectId, deviceId, window }) =>
			toToolResult(
				await loopback(
					"GET",
					`/v1/projects/${projectId}/devices/${deviceId}/metrics`,
					{ query: { window } },
				),
			),
	);

	server.registerTool(
		"devicesdk_project_metrics",
		{
			title: "Project usage metrics",
			description:
				"Get aggregated usage metrics for every device in a project, plus project totals.",
			inputSchema: { projectId: projectIdParam, window: windowParam },
			annotations: { readOnlyHint: true, title: "Project usage metrics" },
		},
		async ({ projectId, window }) =>
			toToolResult(
				await loopback("GET", `/v1/projects/${projectId}/metrics`, {
					query: { window },
				}),
			),
	);

	server.registerTool(
		"devicesdk_env_list",
		{
			title: "List env var keys",
			description:
				"List environment variable keys set on a project. Values are never returned by " +
				"the API (for security) - only keys and their last-updated timestamps.",
			inputSchema: { projectId: projectIdParam },
			annotations: { readOnlyHint: true, title: "List env var keys" },
		},
		async ({ projectId }) =>
			toToolResult(await loopback("GET", `/v1/projects/${projectId}/env`)),
	);

	server.registerTool(
		"devicesdk_list_script_versions",
		{
			title: "List script versions",
			description:
				"List every uploaded script version for a device, newest first, flagging which " +
				"one is currently deployed (is_current).",
			inputSchema: { projectId: projectIdParam, deviceId: deviceIdParam },
			annotations: { readOnlyHint: true, title: "List script versions" },
		},
		async ({ projectId, deviceId }) =>
			toToolResult(
				await loopback(
					"GET",
					`/v1/projects/${projectId}/devices/${deviceId}/script/versions`,
				),
			),
	);

	server.registerTool(
		"devicesdk_docs_search",
		{
			title: "Search DeviceSDK docs",
			description:
				"Full-text search over a local, offline copy of the DeviceSDK docs matching " +
				"this server's version (no internet call; results can lag the live site until " +
				"the server is updated). Returns ranked { path, url, title, snippet } rows.",
			inputSchema: { query: z.string().min(1) },
			annotations: { readOnlyHint: true, title: "Search DeviceSDK docs" },
		},
		async ({ query }) => {
			const result = searchDocs(query, docsIndexPath);
			return {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				isError: !result.success,
			};
		},
	);

	// --- Mutating tools --------------------------------------------------

	server.registerTool(
		"devicesdk_env_set",
		{
			title: "Set env vars",
			description:
				"Set one or more environment variables on a project. Values become visible to " +
				"the device script via this.env.VARS.get(key).",
			inputSchema: {
				projectId: projectIdParam,
				vars: z
					.record(z.string(), z.string())
					.describe("Map of KEY (uppercase, digits, underscores) to value."),
			},
			annotations: { title: "Set env vars" },
		},
		async ({ projectId, vars }) =>
			toToolResult(
				await loopback("PUT", `/v1/projects/${projectId}/env`, {
					body: { vars },
				}),
			),
	);

	server.registerTool(
		"devicesdk_env_delete",
		{
			title: "Delete an env var",
			description: "Delete a single environment variable key from a project.",
			inputSchema: { projectId: projectIdParam, key: z.string().min(1) },
			annotations: { destructiveHint: true, title: "Delete an env var" },
		},
		async ({ projectId, key }) =>
			toToolResult(
				await loopback(
					"DELETE",
					`/v1/projects/${projectId}/env/${encodeURIComponent(key)}`,
				),
			),
	);

	server.registerTool(
		"devicesdk_send_command",
		{
			title: "Send a device command",
			description:
				"Send a hardware command to a connected device and wait for its response " +
				"(GPIO, PWM, I2C, SPI, UART, display, watchdog, reboot, ...). Fails with 503 if " +
				"the device isn't currently connected, 504 if it doesn't answer in time.",
			inputSchema: {
				projectId: projectIdParam,
				deviceId: deviceIdParam,
				type: z
					.enum(COMMAND_TYPES)
					.describe("Command type - see the device command reference docs."),
				payload: z
					.record(z.string(), z.unknown())
					.optional()
					.describe("Command-specific payload object (max 4KB serialized)."),
			},
			annotations: { title: "Send a device command" },
		},
		async ({ projectId, deviceId, type, payload }) =>
			toToolResult(
				await loopback(
					"POST",
					`/v1/projects/${projectId}/devices/${deviceId}/command`,
					{ body: { type, payload: payload ?? {} } },
				),
			),
	);

	server.registerTool(
		"devicesdk_upload_script",
		{
			title: "Upload a script version",
			description:
				"Upload a new script version for a device and deploy it immediately. `script` " +
				"must be already-bundled JavaScript (a single file, no bare imports) - build " +
				"TypeScript device projects with `devicesdk build` or the CLI deploy flow first; " +
				"this tool cannot bundle TypeScript itself.",
			inputSchema: {
				projectId: projectIdParam,
				deviceId: deviceIdParam,
				script: z.string().min(1).describe("Bundled JavaScript source."),
				entrypoint: z
					.string()
					.min(1)
					.max(255)
					.describe(
						"Exported class name to instantiate (a valid JS identifier).",
					),
				message: z
					.string()
					.max(500)
					.optional()
					.describe(
						"Optional version note shown in devicesdk_list_script_versions.",
					),
			},
			annotations: { title: "Upload a script version" },
		},
		async ({ projectId, deviceId, script, entrypoint, message }) =>
			toToolResult(
				await loopback(
					"PUT",
					`/v1/projects/${projectId}/devices/${deviceId}/script`,
					{ body: { script, entrypoint, message } },
				),
			),
	);

	server.registerTool(
		"devicesdk_deploy_version",
		{
			title: "Deploy a script version",
			description:
				"Activate a previously-uploaded script version on a device (rollback or " +
				"promote) - the version must already exist per devicesdk_list_script_versions.",
			inputSchema: {
				projectId: projectIdParam,
				deviceId: deviceIdParam,
				versionId: z.string().min(1).max(36),
			},
			annotations: { title: "Deploy a script version" },
		},
		async ({ projectId, deviceId, versionId }) =>
			toToolResult(
				await loopback(
					"POST",
					`/v1/projects/${projectId}/devices/${deviceId}/script/versions/${versionId}/deploy`,
				),
			),
	);
}
