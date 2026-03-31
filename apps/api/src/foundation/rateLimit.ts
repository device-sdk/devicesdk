import type { Context, Next } from "hono";
import type { AppContext } from "../types";
import { TIER_LIMITS, type UserPlan } from "./consts";

export function rateLimitMiddleware(maxRequests: number, windowMs: number) {
	return async (
		c: Context<{ Bindings: { DB: D1Database; ENV?: string } }>,
		next: Next,
	) => {
		const ip =
			c.req.header("cf-connecting-ip") ??
			c.req.header("x-forwarded-for") ??
			"unknown";
		const key = `${ip}:${c.req.path}`;
		const now = Date.now();
		const windowStart = now - windowMs;

		// Clean expired entries off the hot path — runs after the response is sent
		c.executionCtx.waitUntil(
			c.env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?")
				.bind(now)
				.run(),
		);

		// Count recent requests
		const count = await c.env.DB.prepare(
			"SELECT COUNT(*) as cnt FROM rate_limits WHERE key = ? AND created_at > ?",
		)
			.bind(key, windowStart)
			.first<{ cnt: number }>();

		if (count && count.cnt >= maxRequests) {
			return c.json({ success: false, error: "Too many requests" }, 429);
		}

		// Record this request
		await c.env.DB.prepare(
			"INSERT INTO rate_limits (key, created_at, expires_at) VALUES (?, ?, ?)",
		)
			.bind(key, now, now + windowMs)
			.run();

		await next();
	};
}

/**
 * Per-user rate limiting middleware. Reads the user's plan from context
 * and applies the corresponding rate limit from TIER_LIMITS.
 * Must be mounted AFTER authenticateUser middleware.
 */
export function userRateLimitMiddleware() {
	return async (c: AppContext, next: Next) => {
		const user = c.get("user");
		if (!user) {
			await next();
			return;
		}

		const plan: UserPlan = user.plan ?? "free";
		const { maxRequests, windowMs } = TIER_LIMITS[plan].apiRateLimit;
		const key = `user:${user.id}`;
		const now = Date.now();
		const windowStart = now - windowMs;

		// Clean expired entries off the hot path
		c.executionCtx.waitUntil(
			c.env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?")
				.bind(now)
				.run(),
		);

		// Count recent requests for this user
		const count = await c.env.DB.prepare(
			"SELECT COUNT(*) as cnt FROM rate_limits WHERE key = ? AND created_at > ?",
		)
			.bind(key, windowStart)
			.first<{ cnt: number }>();

		if (count && count.cnt >= maxRequests) {
			// Find the oldest request in the window to calculate Retry-After
			const oldest = await c.env.DB.prepare(
				"SELECT MIN(created_at) as oldest FROM rate_limits WHERE key = ? AND created_at > ?",
			)
				.bind(key, windowStart)
				.first<{ oldest: number }>();

			const retryAfterMs = oldest ? oldest.oldest + windowMs - now : windowMs;
			const retryAfterSec = Math.ceil(Math.max(retryAfterMs, 1000) / 1000);

			return c.json(
				{
					success: false,
					error: "Too many requests. Please try again later.",
				},
				{
					status: 429,
					headers: { "Retry-After": String(retryAfterSec) },
				},
			);
		}

		// Record this request
		await c.env.DB.prepare(
			"INSERT INTO rate_limits (key, created_at, expires_at) VALUES (?, ?, ?)",
		)
			.bind(key, now, now + windowMs)
			.run();

		await next();
	};
}
