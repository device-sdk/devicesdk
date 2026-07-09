import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TestServer, type TestUser } from "../harness";

const SCRIPT_PATH = new URL(
	"../../scripts/build-docs-index.ts",
	import.meta.url,
).pathname;
const DOCS_PUBLIC_DIR = new URL("../../../../docs/public", import.meta.url)
	.pathname;

const MCP_HEADERS = {
	"content-type": "application/json",
	accept: "application/json, text/event-stream",
};

const EXPECTED_TOOLS = [
	"devicesdk_whoami",
	"devicesdk_list_projects",
	"devicesdk_list_devices",
	"devicesdk_device_status",
	"devicesdk_device_logs",
	"devicesdk_device_metrics",
	"devicesdk_project_metrics",
	"devicesdk_env_list",
	"devicesdk_list_script_versions",
	"devicesdk_docs_search",
	"devicesdk_env_set",
	"devicesdk_env_delete",
	"devicesdk_send_command",
	"devicesdk_upload_script",
	"devicesdk_deploy_version",
].sort();

interface McpEnvelope<T> {
	jsonrpc: string;
	id: number;
	result?: T;
}
interface ToolsListResult {
	tools: { name: string }[];
}
interface ToolCallResult {
	content: { type: string; text: string }[];
	isError: boolean;
}

function rpc(method: string, params: unknown, id = 1) {
	return { jsonrpc: "2.0", id, method, params };
}

function toolCall(name: string, args: Record<string, unknown> = {}) {
	return rpc("tools/call", { name, arguments: args });
}

/** Parses a tools/call result's content[0].text as the wrapped REST envelope. */
function parseToolBody(body: McpEnvelope<ToolCallResult>): {
	success: boolean;
	[key: string]: unknown;
} {
	const text = body.result?.content[0]?.text ?? "{}";
	return JSON.parse(text);
}

let srv: TestServer;
let docsIndexOutDir: string;

beforeAll(async () => {
	// Build a real docs index from the repo's actual docs/public so the
	// devicesdk_docs_search test below exercises the same content the tool
	// ships with, without depending on `pnpm build` having run first.
	docsIndexOutDir = mkdtempSync(join(tmpdir(), "dsdk-mcp-docs-index-"));
	const indexPath = join(docsIndexOutDir, "docs-index.sqlite");
	const proc = Bun.spawnSync([
		"bun",
		"run",
		SCRIPT_PATH,
		DOCS_PUBLIC_DIR,
		indexPath,
	]);
	if (proc.exitCode !== 0) {
		throw new Error(
			`docs index build failed (exit ${proc.exitCode}): ${proc.stderr.toString()}`,
		);
	}

	srv = await TestServer.start({ DOCS_INDEX_PATH: indexPath });
});

afterAll(async () => {
	await srv.stop();
	rmSync(docsIndexOutDir, { recursive: true, force: true });
});

describe("POST /mcp: authentication", () => {
	test("no credentials -> 401 with WWW-Authenticate pointing at OAuth discovery", async () => {
		const res = await srv.post("/mcp", {
			body: rpc("tools/list", {}),
			headers: MCP_HEADERS,
		});
		expect(res.status).toBe(401);
		const www = res.headers.get("www-authenticate") ?? "";
		expect(www).toContain("resource_metadata");
		expect(www).toContain("/.well-known/oauth-protected-resource");
	});

	test("GET /mcp -> 405 (stateless server, no SSE stream to resume)", async () => {
		const res = await srv.get("/mcp");
		expect(res.status).toBe(405);
	});

	test("DELETE /mcp -> 405 (no session to terminate)", async () => {
		const res = await srv.delete("/mcp");
		expect(res.status).toBe(405);
	});
});

describe("POST /mcp: tools/list", () => {
	let owner: TestUser;
	beforeAll(async () => {
		owner = await srv.register({
			email: `mcp-list-${crypto.randomUUID()}@example.com`,
		});
	});

	test("returns exactly the 15 devicesdk_* tools", async () => {
		const res = await srv.post("/mcp", {
			token: owner.token,
			body: rpc("tools/list", {}),
			headers: MCP_HEADERS,
		});
		expect(res.status).toBe(200);
		const body = res.body as McpEnvelope<ToolsListResult>;
		const names = (body.result?.tools ?? []).map((t) => t.name).sort();
		expect(names).toEqual(EXPECTED_TOOLS);
	});
});

describe("POST /mcp: tools/call", () => {
	let owner: TestUser;
	beforeAll(async () => {
		owner = await srv.register({
			email: `mcp-call-${crypto.randomUUID()}@example.com`,
		});
	});

	test("devicesdk_whoami returns the caller's own account", async () => {
		const res = await srv.post("/mcp", {
			token: owner.token,
			body: toolCall("devicesdk_whoami"),
			headers: MCP_HEADERS,
		});
		expect(res.status).toBe(200);
		const parsed = parseToolBody(res.body as McpEnvelope<ToolCallResult>) as {
			success: boolean;
			result: { email: string };
		};
		expect(parsed.success).toBe(true);
		expect(parsed.result.email).toBe(owner.user.email);
	});

	test("devicesdk_list_projects returns a project created via REST", async () => {
		const created = await srv.post("/v1/projects", {
			token: owner.token,
			body: { project_slug: "mcp-proj", name: "MCP Proj" },
		});
		expect(created.status).toBe(201);

		const res = await srv.post("/mcp", {
			token: owner.token,
			body: toolCall("devicesdk_list_projects"),
			headers: MCP_HEADERS,
		});
		expect(res.status).toBe(200);
		const parsed = parseToolBody(res.body as McpEnvelope<ToolCallResult>) as {
			success: boolean;
			result: { items: { project_slug: string }[] };
		};
		expect(parsed.success).toBe(true);
		expect(parsed.result.items.some((p) => p.project_slug === "mcp-proj")).toBe(
			true,
		);
	});

	test("devicesdk_env_set then devicesdk_env_list roundtrips a key", async () => {
		await srv.post("/v1/projects", {
			token: owner.token,
			body: { project_slug: "mcp-env", name: "MCP Env" },
		});

		const setRes = await srv.post("/mcp", {
			token: owner.token,
			body: toolCall("devicesdk_env_set", {
				projectId: "mcp-env",
				vars: { FOO: "bar" },
			}),
			headers: MCP_HEADERS,
		});
		expect(setRes.status).toBe(200);
		expect((setRes.body as McpEnvelope<ToolCallResult>).result?.isError).toBe(
			false,
		);

		const listRes = await srv.post("/mcp", {
			token: owner.token,
			body: toolCall("devicesdk_env_list", { projectId: "mcp-env" }),
			headers: MCP_HEADERS,
		});
		const parsed = parseToolBody(
			listRes.body as McpEnvelope<ToolCallResult>,
		) as { success: boolean; result: { vars: { key: string }[] } };
		expect(parsed.success).toBe(true);
		expect(parsed.result.vars.some((v) => v.key === "FOO")).toBe(true);
	});

	test("cross-user isolation: caller never sees another user's projects", async () => {
		const userA = await srv.register({
			email: `mcp-a-${crypto.randomUUID()}@example.com`,
		});
		const userB = await srv.register({
			email: `mcp-b-${crypto.randomUUID()}@example.com`,
		});
		await srv.post("/v1/projects", {
			token: userA.token,
			body: { project_slug: "a-only", name: "A only" },
		});

		const res = await srv.post("/mcp", {
			token: userB.token,
			body: toolCall("devicesdk_list_projects"),
			headers: MCP_HEADERS,
		});
		const parsed = parseToolBody(res.body as McpEnvelope<ToolCallResult>) as {
			result: { items: { project_slug: string }[] };
		};
		expect(parsed.result.items.some((p) => p.project_slug === "a-only")).toBe(
			false,
		);
	});

	test("devicesdk_send_command against an unconnected device -> isError (503)", async () => {
		await srv.post("/v1/projects", {
			token: owner.token,
			body: { project_slug: "mcp-cmd", name: "MCP Cmd" },
		});
		await srv.post("/v1/projects/mcp-cmd/devices", {
			token: owner.token,
			body: { device_id: "dev1", name: "Dev 1" },
		});

		const res = await srv.post("/mcp", {
			token: owner.token,
			body: toolCall("devicesdk_send_command", {
				projectId: "mcp-cmd",
				deviceId: "dev1",
				type: "reboot",
			}),
			headers: MCP_HEADERS,
		});
		expect(res.status).toBe(200);
		expect((res.body as McpEnvelope<ToolCallResult>).result?.isError).toBe(
			true,
		);
	});

	test("devicesdk_docs_search finds mDNS-related docs pages under /docs/", async () => {
		const res = await srv.post("/mcp", {
			token: owner.token,
			body: toolCall("devicesdk_docs_search", { query: "mdns" }),
			headers: MCP_HEADERS,
		});
		expect(res.status).toBe(200);
		const parsed = parseToolBody(res.body as McpEnvelope<ToolCallResult>) as {
			success: boolean;
			result: { matches: { url: string }[] };
		};
		expect(parsed.success).toBe(true);
		expect(parsed.result.matches.length).toBeGreaterThan(0);
		expect(
			parsed.result.matches.every((m) =>
				m.url.startsWith("https://devicesdk.com/docs/"),
			),
		).toBe(true);
	});
});
