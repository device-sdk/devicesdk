import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
	handleAuthStatus,
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
import { authenticateUser, cliAuthUser, handleLogout } from "./foundation/auth";
import { logger } from "./foundation/logger";
import { rateLimitMiddleware } from "./foundation/rateLimit";
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

// 1. Endpoints that don't require auth — local account login/registration
app.get("/v1/auth/status", handleAuthStatus);
app.use("/v1/auth/register", rateLimitMiddleware(10, 60_000));
app.use("/v1/auth/login", rateLimitMiddleware(20, 60_000));
app.post("/v1/auth/register", handleRegister);
app.post("/v1/auth/login", handleLogin);

app.use("/v1/cli/auth/start", rateLimitMiddleware(10, 60_000)); // 10 req/min
app.use("/v1/cli/auth/poll", rateLimitMiddleware(60, 60_000)); // 60 req/min
app.use("/v1/cli/auth/refresh", rateLimitMiddleware(10, 60_000)); // 10 req/min

app.route("/v1/cli/auth", cliAuthRouterPreAuth);

// CLI approval page (requires auth - redirects to dashboard login if not authenticated)
app.get("/cli/auth", cliAuthUser, getApprovalPage);
app.post("/cli/auth", cliAuthUser, handleApproval);

// 2. Authentication middleware for the API
app.use("/v1/*", authenticateUser);

// 3. Endpoints that require auth
registerDeviceWsRoutes(app);
app.route("/v1/cli/auth", cliAuthRouterPostAuth);
app.post("/v1/auth/logout", handleLogout);
app.route("/v1/user", userRouter);
app.route("/v1/projects", projectsRouter);
app.route("/v1/tokens", tokensRouter);
app.route("/v1/projects/:projectId/env", envVarsRouter);
app.route("/v1/projects/:projectId/devices", devicesRouter);
app.route("/v1/projects/:projectId/devices/:deviceId/script", scriptsRouter);
app.route("/v1/projects/:projectId/devices/:deviceId/logs", logsRouter);
app.route("/v1/projects/:projectId/scripts", batchScriptsRouter);

// 4. Dashboard SPA — served same-origin for any non-API path.
app.get("*", serveSpa);
