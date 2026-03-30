import { googleAuth } from "@hono/oauth-providers/google";
import { ApiException, fromHono } from "chanfana";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
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
import { rateLimitMiddleware } from "./foundation/rateLimit";
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
		return c.json(
			{ success: false, errors: err.buildResponse() },
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

	// Catch ZodErrors that escape chanfana's validation handler
	// (cross-realm instanceof can fail in Workers runtime)
	if (
		err &&
		"issues" in err &&
		Array.isArray((err as { issues: unknown }).issues)
	) {
		return c.json(
			{
				success: false,
				errors: (err as { issues: Array<{ message: string; path: Array<string | number> }> }).issues.map((issue) => ({
					code: 7001,
					message: issue.message,
					path: issue.path?.map(String),
				})),
			},
			400,
		);
	}

	console.error(`Global error handler caught ${err.name}:${err.message}`, {
		err: JSON.stringify(err),
	}); // Log the error if it's not known

	// For other errors, return a generic 500 response
	const isDev = c.env.ENV === "local";
	return c.json(
		{
			success: false,
			errors: [
				{
					code: 7000,
					...(isDev
						? { name: err.name, message: err.message }
						: { message: "Internal Server Error" }),
				},
			],
		},
		500,
	);
});

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

// 3. Endpoints that require Auth
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

export default app;
export { BaseDevice as Device } from "./durableObjects/lib/device";
export { DeviceSender } from "./durableObjects/lib/deviceSender";
export { DevicesBridge } from "./durableObjects/lib/devicesBridge";

// TEST ONLY — do NOT add TestDevice to wrangler.jsonc durable_objects.bindings.
// It bypasses internal guards and must never be deployed as a production DO binding.
// Exported here solely because miniflare requires DO classes to come from the main
// worker script; auxiliary worker TypeScript resolution is not supported by miniflare.
export { TestDevice } from "./durableObjects/lib/testDevice";

// export default Sentry.withSentry(
//   env => ({
//     dsn: "https://5fbf4d8253dca6977a71ff13d52295b6@o247228.ingest.us.sentry.io/4509820143665152",
//
//     // Setting this option to true will send default PII data to Sentry.
//     // For example, automatic IP address collection on events
//     sendDefaultPii: true,
//   }),
//   app,
// );
