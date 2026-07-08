import { StreamableHTTPTransport } from "@hono/mcp";
import type { AppContext, Env } from "../types";
import { buildMcpServer } from "./mcpServer";
import type { LoopbackFn } from "./tools";

/**
 * Minimal shape this module needs from the top-level Hono app: just
 * `.request()`, used to re-enter the REST API in-process (see tools.ts).
 * Deliberately structural (not `import type { app } from "../index"`) - index.ts
 * mounts this route, so importing the `app` value here would be a module
 * import cycle. index.ts passes its own `app` in when it calls
 * `createMcpPostRoute(app)`; any object with a Hono-shaped `.request()` works.
 */
export interface AppRequester {
	request: (
		input: string,
		requestInit?: RequestInit,
		env?: Env,
	) => Response | Promise<Response>;
}

function buildLoopback(appLike: AppRequester, c: AppContext): LoopbackFn {
	// Forward whatever credential authenticated the outer /mcp call (Bearer
	// token or, harmlessly, a same-origin session cookie) so the inner REST
	// call authenticates as the same user.
	const authHeader = c.req.header("Authorization");
	const cookieHeader = c.req.header("Cookie");

	return async (method, path, opts) => {
		const url = new URL(path, "http://internal.invalid");
		if (opts?.query) {
			for (const [key, value] of Object.entries(opts.query)) {
				if (value !== undefined) url.searchParams.set(key, String(value));
			}
		}

		const headers: Record<string, string> = {};
		if (authHeader) headers.Authorization = authHeader;
		if (cookieHeader) headers.Cookie = cookieHeader;

		let body: string | undefined;
		if (opts?.body !== undefined) {
			body = JSON.stringify(opts.body);
			headers["Content-Type"] = "application/json";
		}

		const res = await appLike.request(
			`${url.pathname}${url.search}`,
			{ method, headers, body },
			c.env,
		);
		const text = await res.text();
		let parsed: unknown;
		try {
			parsed = text ? JSON.parse(text) : undefined;
		} catch {
			parsed = undefined;
		}
		return { status: res.status, body: parsed };
	};
}

/**
 * Builds the `POST /mcp` handler. Stateless: a fresh McpServer + transport is
 * constructed per request (no `Mcp-Session-Id`, no server-to-client push
 * streams), so there is no cross-request state to leak between callers or
 * clean up between requests.
 */
export function createMcpPostRoute(appLike: AppRequester) {
	return async (c: AppContext) => {
		const loopback = buildLoopback(appLike, c);
		const server = buildMcpServer({ loopback });
		const transport = new StreamableHTTPTransport({
			// Stateless mode (MCP SDK): no session id is generated or validated.
			sessionIdGenerator: undefined,
			// Plain JSON responses - fitting for a stateless server with no
			// server-initiated push, and simpler for every client to consume.
			enableJsonResponse: true,
		});
		await server.connect(transport);
		const res = await transport.handleRequest(c);
		// The MCP SDK's own type says `Response | undefined`; every branch in
		// the POST handler we rely on (stateless, enableJsonResponse) actually
		// returns a Response, but keep a defensive fallback rather than `!`.
		return (
			res ??
			c.json(
				{ success: false, error: "MCP transport produced no response" },
				500,
			)
		);
	};
}

/** GET and DELETE are not supported by this stateless server. */
export function mcpMethodNotAllowed(c: AppContext) {
	return c.json(
		{
			jsonrpc: "2.0",
			error: { code: -32000, message: "Method not allowed." },
			id: null,
		},
		405,
		{ Allow: "POST" },
	);
}
