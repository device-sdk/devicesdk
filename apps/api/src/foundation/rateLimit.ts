import type { Context, Next } from "hono";

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

		// Clean expired entries
		await c.env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?")
			.bind(now)
			.run();

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
