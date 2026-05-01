import * as Sentry from "@sentry/cloudflare";
import type { Next } from "hono";
import type { AppContext } from "../types";
import { TieredCache } from "./tieredCache";

/**
 * Cross-route block list.
 *
 * When a user trips the per-route rate limit (currently `/logs`, see
 * `rateLimit.ts`), we write `{ reason, until, path }` to the shared `CACHE`
 * KV namespace under the `block:user:<id>` key with a 1 h TTL. This middleware
 * reads that entry through the L1 (Cache API) → L2 (KV) tiered cache and
 * short-circuits with 429 if it finds an unexpired block.
 *
 * Mounted immediately after `authenticateUser` so blocked users never reach
 * the per-route rate limiter, the route handler, D1, or the DO. The L1 hit
 * resolves in sub-millisecond and costs nothing on the Workers free tier.
 *
 * Failure modes:
 *   - L1/L2 errors are caught, captured to Sentry, and we fail open. A
 *     misconfigured KV binding must not knock the API offline.
 *   - Stale entries (`until` already in the past) are ignored — KV's
 *     `expirationTtl` should normally evict them, this is just defense.
 */
export function userBlockListMiddleware() {
	return async (c: AppContext, next: Next) => {
		// Skip in local dev — block list is a production abuse-prevention feature.
		if (c.env.ENV === "local") {
			await next();
			return;
		}

		const user = c.get("user");
		if (!user) {
			await next();
			return;
		}

		try {
			const cache = new TieredCache(c.env.CACHE, "block", c.executionCtx);
			const blocked = await cache.get<{
				reason: string;
				until: number;
				path?: string;
			}>(`user:${user.id}`);

			if (blocked && blocked.until > Date.now()) {
				const retryAfterSec = Math.max(
					1,
					Math.ceil((blocked.until - Date.now()) / 1000),
				);
				return c.json(
					{
						success: false,
						error:
							"Rate limited. Retry after the period in the Retry-After header.",
						code: blocked.reason,
					},
					{
						status: 429,
						headers: { "Retry-After": String(retryAfterSec) },
					},
				);
			}
		} catch (err) {
			// Fail open — abuse prevention should never take the API offline.
			Sentry.captureException(err);
		}

		await next();
	};
}
