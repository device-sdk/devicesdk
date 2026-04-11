import { googleAuth } from "@hono/oauth-providers/google";
import * as Sentry from "@sentry/cloudflare";
import { ApiException, fromHono } from "chanfana";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { D1QB } from "workers-qb";
import {
	getApprovalPage,
	handleApproval,
} from "./endpoints/cli-auth/approvalPage";
import {
	cliAuthRouterPostAuth,
	cliAuthRouterPreAuth,
} from "./endpoints/cli-auth/router";
import { devicesRouter } from "./endpoints/devices/router";
import { envVarsRouter } from "./endpoints/env-vars/router";
import { logsRouter } from "./endpoints/logs/router";
import { projectsRouter } from "./endpoints/projects/router";
import { batchScriptsRouter, scriptsRouter } from "./endpoints/scripts/router";
import { tokensRouter } from "./endpoints/tokens/router";
import { userRouter } from "./endpoints/user/router";
import {
	authenticateUser,
	cliAuthUser,
	handleGoogleCallback,
	handleLogout,
} from "./foundation/auth";
import {
	rateLimitMiddleware,
	userRateLimitMiddleware,
} from "./foundation/rateLimit";
import { handleScheduled } from "./scheduled";
import type { Env, Variables } from "./types";

const app = fromHono(new Hono<{ Bindings: Env; Variables: Variables }>(), {
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
	docs_url: "/",
});
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

	console.error(`Global error handler caught ${err.name}:${err.message}`, {
		err: JSON.stringify(err),
	}); // Log the error if it's not known

	Sentry.captureException(err);

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
		},
	}),
);
app.use(
	"*",
	cors({
		credentials: true,
		origin: ["https://dash.devicesdk.com", "http://localhost:9000"],
	}),
);
app.use(async (c, next) => {
	c.set("qb", new D1QB(c.env.DB));
	await next();
});

// Guard: reject requests if ENV is misconfigured — prevents deploys with an
// invalid ENV value from serving traffic (e.g. rate limiting disabled by
// mistake). We can't cross-check env vs. host here because wrangler dev
// simulates the production custom domain in local mode.
app.use("*", async (c, next) => {
	const env = c.env.ENV;
	if (!env || !["local", "production"].includes(env)) {
		return c.json(
			{ success: false, error: "Server misconfiguration: invalid ENV" },
			500,
		);
	}
	await next();
});

// 1. Endpoints that don't require Auth
app.get(
	"/v1/auth/google",
	async (c, next) => {
		let authMiddleware: MiddlewareHandler;
		if (c.env.ENV === "local") {
			authMiddleware = googleAuth({
				client_id: c.env.GOOGLE_ID,
				client_secret: c.env.GOOGLE_SECRET,
				scope: ["openid", "email", "profile"],
				redirect_uri: "http://localhost:8787/v1/auth/google",
			});
		} else {
			authMiddleware = googleAuth({
				client_id: c.env.GOOGLE_ID,
				client_secret: c.env.GOOGLE_SECRET,
				scope: ["openid", "email", "profile"],
			});
		}

		return authMiddleware(c, next);
	},
	handleGoogleCallback,
);

app.use("/v1/cli/auth/start", rateLimitMiddleware(10, 60_000)); // 10 req/min
app.use("/v1/cli/auth/poll", rateLimitMiddleware(60, 60_000)); // 60 req/min
app.use("/v1/cli/auth/refresh", rateLimitMiddleware(10, 60_000)); // 10 req/min

app.route("/v1/cli/auth", cliAuthRouterPreAuth);

// CLI approval page (requires auth - redirects to dashboard login if not authenticated)
app.get("/cli/auth", cliAuthUser, getApprovalPage);
app.post("/cli/auth", cliAuthUser, handleApproval);

// 2. Authentication middleware
app.use("*", authenticateUser);

// Set Sentry user context for all authenticated requests.
// sendDefaultPii is false, so we only attach the opaque user ID (not email)
// to keep PII out of Sentry while still being able to correlate errors to accounts.
app.use("*", async (c, next) => {
	const user = c.get("user");
	if (user) {
		Sentry.setUser({ id: user.id });
		Sentry.setTag("plan", user.plan ?? "free");
	}
	await next();
});

// 3. Per-user rate limiting (plan-aware)
app.use("*", userRateLimitMiddleware());

// 4. Endpoints that require Auth
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

const sentryWrapped = Sentry.withSentry(
	(env: Env) => ({
		dsn: env.SENTRY_DSN,
		sendDefaultPii: false,
		environment: env.ENV,
	}),
	{
		fetch: app.fetch,
		scheduled: handleScheduled,
	} as ExportedHandler<Env>,
);

export default sentryWrapped;
export { BaseDevice as Device } from "./durableObjects/lib/device";
export { DeviceSender } from "./durableObjects/lib/deviceSender";
export { DevicesBridge } from "./durableObjects/lib/devicesBridge";

// TEST ONLY — do NOT add TestDevice to wrangler.jsonc durable_objects.bindings.
// It bypasses internal guards and must never be deployed as a production DO binding.
// Exported here solely because miniflare requires DO classes to come from the main
// worker script; auxiliary worker TypeScript resolution is not supported by miniflare.
export { TestDevice } from "./durableObjects/lib/testDevice";
