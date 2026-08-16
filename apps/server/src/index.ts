import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
	handleAuthStatus,
	handleChangePassword,
	handleLogin,
	handleRegister,
} from "./endpoints/auth/localAuth";
import {
	getApprovalPage,
	handleApproval,
} from "./endpoints/cli-auth/approvalPage";
import {
	cliAuthRouterPostAuth,
	cliAuthRouterPreAuth,
} from "./endpoints/cli-auth/router";
import { devicesRouter } from "./endpoints/devices/router";
import { registerDeviceWsRoutes } from "./endpoints/devices/wsRoutes";
import { envVarsRouter } from "./endpoints/env-vars/router";
import { logsRouter } from "./endpoints/logs/router";
import { projectsRouter } from "./endpoints/projects/router";
import { batchScriptsRouter, scriptsRouter } from "./endpoints/scripts/router";
import { tokensRouter } from "./endpoints/tokens/router";
import { userRouter } from "./endpoints/user/router";
import {
	authenticateUser,
	cliAuthUser,
	handleLogout,
	mcpAuth,
} from "./foundation/auth";
import { logger } from "./foundation/logger";
import { rateLimitMiddleware } from "./foundation/rateLimit";
import { createMcpPostRoute, mcpMethodNotAllowed } from "./mcp/route";
import { getAuthorizePage, postAuthorizeAction } from "./oauth/authorizePage";
import {
	authorizationServerMetadata,
	protectedResourceMetadata,
} from "./oauth/metadata";
import { handleRegisterClient } from "./oauth/register";
import { handleTokenExchange } from "./oauth/token";
import { serveSpa } from "./spa";
import type { Env, Variables } from "./types";

export const app = fromHono(
	new Hono<{ Bindings: Env; Variables: Variables }>(),
	{
		schema: {
			info: {
				title: "DeviceSDK API",
				version: "1.0",
			},
			security: [
				{
					bearerAuth: [],
				},
			],
		},
		docs_url: "/api-docs",
	},
);
app.registry.registerComponent("securitySchemes", "bearerAuth", {
	type: "http",
	scheme: "bearer",
});
app.onError((err, c) => {
	if (err instanceof ApiException) {
		// If it's a Chanfana ApiException, let Chanfana handle the response
		const messages = err.buildResponse();
		return c.json(
			{
				success: false,
				error: messages[0]?.message || "Unknown error",
			},
			err.status as ContentfulStatusCode,
		);
	}

	// Chanfana 3.x: validation errors flow through as HTTPException.
	// Also handle chanfana's internal HTTPException (different class from hono's)
	// by duck-typing: any error with a numeric status and getResponse() method.
	if (
		err instanceof HTTPException ||
		(typeof (err as { status?: unknown }).status === "number" &&
			typeof (err as { getResponse?: unknown }).getResponse === "function")
	) {
		return (err as HTTPException).getResponse();
	}

	logger.error(err, "Global error handler caught unhandled error", {
		errorName: err.name,
	});

	// For other errors, return a generic 500 response
	const isDev = c.env.ENV === "local";
	return c.json(
		{
			success: false,
			error: isDev ? err.message : "Internal Server Error",
		},
		500,
	);
});

app.use(
	"*",
	secureHeaders({
		contentSecurityPolicy: {
			defaultSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			imgSrc: ["'self'", "data:"],
			fontSrc: ["'self'", "data:"],
			// The dashboard opens watch WebSockets back to this same host.
			connectSrc: ["'self'", "ws:", "wss:"],
		},
	}),
);
// Same-origin serving means CORS only matters for the quasar/vite dev servers.
app.use(
	"*",
	cors({
		credentials: true,
		origin: ["http://localhost:9000", "http://localhost:9002"],
	}),
);
app.use(async (c, next) => {
	c.set("qb", c.env.qb);
	await next();
});

// 1. Endpoints that don't require auth - local account login/registration
app.get("/v1/auth/status", handleAuthStatus);
app.use("/v1/auth/register", rateLimitMiddleware(10, 60_000));
app.use("/v1/auth/login", rateLimitMiddleware(20, 60_000));
app.post("/v1/auth/register", handleRegister);
app.post("/v1/auth/login", handleLogin);

app.use("/v1/cli/auth/start", rateLimitMiddleware(10, 60_000)); // 10 req/min
app.use("/v1/cli/auth/poll", rateLimitMiddleware(60, 60_000)); // 60 req/min
app.use("/v1/cli/auth/refresh", rateLimitMiddleware(10, 60_000)); // 10 req/min

app.route("/v1/cli/auth", cliAuthRouterPreAuth);

// Change-password and account deletion verify the current password (argon2id),
// so they need the same brute-force throttling as login - a stolen session
// alone must not turn into an unlimited password-guessing oracle.
app.use("/v1/auth/change-password", rateLimitMiddleware(10, 60_000)); // 10 req/min
// GET /v1/user/me is called on every dashboard page load, so scope the limit
// to the DELETE method only.
app.use("/v1/user/me", rateLimitMiddleware(10, 60_000, ["DELETE"])); // 10 req/min

// CLI approval page (requires auth - redirects to dashboard login if not authenticated)
app.use("/cli/auth", rateLimitMiddleware(10, 60_000)); // 10 req/min
app.get("/cli/auth", cliAuthUser, getApprovalPage);
app.post("/cli/auth", cliAuthUser, handleApproval);

// Bundled MCP server: stateless Streamable HTTP at POST /mcp. mcpAuth wraps
// authenticateUser so a 401 carries a WWW-Authenticate header pointing MCP
// clients at the OAuth discovery document below.
// GET/DELETE are unsupported by this stateless server (no SSE stream to
// resume, no session to terminate) - 405 rather than reaching the transport.
app.post("/mcp", mcpAuth, createMcpPostRoute(app));
app.get("/mcp", mcpMethodNotAllowed);
app.delete("/mcp", mcpMethodNotAllowed);

// OAuth 2.1 authorization server for MCP clients (additive to static API
// tokens - see foundation/auth.ts). Discovery metadata is unauthenticated;
// /oauth/authorize requires a dashboard session (cliAuthUser redirects to
// login otherwise, exactly like /cli/auth above); /oauth/register and
// /oauth/token are unauthenticated but rate-limited.
app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);
// RFC 9728 section 3 path-suffixed form, for clients that request the
// metadata document scoped to the specific resource path.
app.get("/.well-known/oauth-protected-resource/mcp", protectedResourceMetadata);
app.get("/.well-known/oauth-authorization-server", authorizationServerMetadata);

app.use("/oauth/register", rateLimitMiddleware(10, 60_000));
app.post("/oauth/register", handleRegisterClient);

app.get("/oauth/authorize", cliAuthUser, getAuthorizePage);
app.post("/oauth/authorize", cliAuthUser, postAuthorizeAction);

app.use("/oauth/token", rateLimitMiddleware(30, 60_000));
app.post("/oauth/token", handleTokenExchange);

// Health / readiness probes - unauthenticated so load balancers and the
// troubleshooting docs can verify the server without credentials.
app.get("/health", (c) => c.json({ success: true, result: { status: "ok" } }));
app.get("/ready", async (c) => {
	try {
		const db = c.env.qb.db;
		// Verify SQLite is writable using an ephemeral temp table.
		db.exec(
			"CREATE TEMP TABLE IF NOT EXISTS _health_probe (id INTEGER PRIMARY KEY, checked_at INTEGER)",
		);
		db.query(
			"INSERT INTO _health_probe (id, checked_at) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET checked_at = ?1",
		).run(Date.now());
		const row = db
			.query("SELECT checked_at FROM _health_probe WHERE id = 1")
			.get() as { checked_at: number } | null;
		if (!row) {
			throw new Error("SQLite health readback returned no row");
		}
		return c.json({
			success: true,
			result: { status: "ready", sqlite: "ok", checkedAt: row.checked_at },
		});
	} catch (err) {
		logger.error(err, "/ready probe failed");
		return c.json({ success: false, error: "Database not writable" }, 503);
	}
});

// 2. Authentication middleware for the API
app.use("/v1/*", authenticateUser);

// 3. Endpoints that require auth
registerDeviceWsRoutes(app);
app.route("/v1/cli/auth", cliAuthRouterPostAuth);
app.post("/v1/auth/logout", handleLogout);
app.post("/v1/auth/change-password", handleChangePassword);
app.route("/v1/user", userRouter);
app.route("/v1/projects", projectsRouter);
app.route("/v1/tokens", tokensRouter);
app.route("/v1/projects/:projectId/env", envVarsRouter);
app.route("/v1/projects/:projectId/devices", devicesRouter);
app.route("/v1/projects/:projectId/devices/:deviceId/script", scriptsRouter);
app.route("/v1/projects/:projectId/devices/:deviceId/logs", logsRouter);
app.route("/v1/projects/:projectId/scripts", batchScriptsRouter);

// 4. Dashboard SPA - served same-origin for any non-API path.
app.get("*", serveSpa);
