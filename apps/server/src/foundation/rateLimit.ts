import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../types";

/**
 * In-memory fixed-window rate limiter. Replaces the D1-backed limiter from
 * the cloud deployment — on a single-process self-hosted server a Map is
 * authoritative. Scoped to brute-forceable auth routes only (login,
 * register, CLI device-code flow).
 */
const windows = new Map<string, { count: number; resetAt: number }>();

function clientIp(c: AppContext): string {
	const headers = c.req.raw.headers;
	const trustProxy = c.env.config.trustProxy;

	if (trustProxy) {
		// Behind a reverse proxy the connection IP is the proxy's; honor the
		// standard forwarding headers when present.
		const forwarded = headers.get("x-forwarded-for");
		if (forwarded) return forwarded.split(",")[0].trim();
		const realIp = headers.get("x-real-ip");
		if (realIp) return realIp;
	}

	// Direct connection: use Bun's socket-level remote address if available.
	// Fall back to "unknown" rather than forwarded headers, which are spoofable
	// when the server is exposed directly to clients.
	const socketIp = c.env.server?.requestIP(c.req.raw)?.address;
	return socketIp ?? "unknown";
}

export function rateLimitMiddleware(
	maxRequests: number,
	windowMs: number,
): MiddlewareHandler {
	return async (c, next) => {
		const key = `${clientIp(c as AppContext)}:${new URL(c.req.url).pathname}`;
		const now = Date.now();
		const entry = windows.get(key);

		if (!entry || entry.resetAt <= now) {
			windows.set(key, { count: 1, resetAt: now + windowMs });
		} else {
			entry.count++;
			if (entry.count > maxRequests) {
				const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
				return c.json(
					{ success: false, error: "Rate limit exceeded. Try again shortly." },
					429,
					{ "Retry-After": String(retryAfter) },
				);
			}
		}

		// Opportunistic cleanup so the map can't grow unbounded.
		if (windows.size > 10_000) {
			for (const [k, v] of windows) {
				if (v.resetAt <= now) windows.delete(k);
			}
		}

		await next();
	};
}
