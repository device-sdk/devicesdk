import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { TIER_LIMITS } from "../../src/foundation/consts";
import { TEST_FREE_SESSION_TOKEN, TEST_FREE_USER_ID } from "../setup-test-data";

const BLOCK_KEY = `block:user:${TEST_FREE_USER_ID}`;

async function clearState(): Promise<void> {
	await env.CACHE.delete(BLOCK_KEY);
	await env.DB.prepare("DELETE FROM rate_limits WHERE key = ?")
		.bind(`user:${TEST_FREE_USER_ID}`)
		.run();
}

async function seedRateLimits(rows: number, windowMs: number): Promise<void> {
	const now = Date.now();
	const stmts: D1PreparedStatement[] = [];
	for (let i = 0; i < rows; i++) {
		stmts.push(
			env.DB.prepare(
				"INSERT INTO rate_limits (key, created_at, expires_at) VALUES (?, ?, ?)",
			).bind(
				`user:${TEST_FREE_USER_ID}`,
				now - i * 100,
				now + windowMs - i * 100,
			),
		);
	}
	await env.DB.batch(stmts);
}

describe("Rate-limit breach promotes to cross-route block", () => {
	afterEach(clearState);

	// Per-user rate limit is scoped to /logs only; using a /logs URL ensures
	// the middleware actually runs. The 429 fires before the route handler so
	// the project/device IDs don't need to exist in D1.
	const RATE_LIMITED_URL =
		"http://localhost/v1/projects/missing/devices/missing/logs";

	it("writes a 1-hour block to CACHE when the per-user limit is exceeded", async () => {
		const { maxRequests, windowMs } = TIER_LIMITS.free.apiRateLimit;

		// Pre-fill the rate_limits table so the next request is over budget.
		await seedRateLimits(maxRequests, windowMs);

		const before = await env.CACHE.get(BLOCK_KEY);
		expect(before).toBeNull();

		const resp = await SELF.fetch(RATE_LIMITED_URL, {
			headers: { Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}` },
		});

		expect(resp.status).toBe(429);

		// The block-list write happens via waitUntil — poll briefly so the
		// background work has a chance to finish writing to KV.
		let after: { reason: string; until: number; path: string } | null = null;
		for (let i = 0; i < 20 && !after; i++) {
			await new Promise((r) => setTimeout(r, 25));
			after = await env.CACHE.get<{
				reason: string;
				until: number;
				path: string;
			}>(BLOCK_KEY, "json");
		}
		expect(after).not.toBeNull();
		expect(after?.reason).toBe("rate-limit");
		expect(after?.until).toBeGreaterThan(Date.now() + 3500_000); // ~1 h ahead
		expect(after?.until).toBeLessThan(Date.now() + 3700_000);
	});

	it("subsequent request from the same user is short-circuited by the block list (no D1 write)", async () => {
		const { maxRequests, windowMs } = TIER_LIMITS.free.apiRateLimit;
		await seedRateLimits(maxRequests, windowMs);

		// Trip the limit once on /logs to populate CACHE.
		const first = await SELF.fetch(RATE_LIMITED_URL, {
			headers: { Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}` },
		});
		expect(first.status).toBe(429);

		// Count rate_limits rows after the breach.
		const before = await env.DB.prepare(
			"SELECT COUNT(*) as cnt FROM rate_limits WHERE key = ?",
		)
			.bind(`user:${TEST_FREE_USER_ID}`)
			.first<{ cnt: number }>();
		const beforeCount = before?.cnt ?? 0;

		// Hit a different route — block list should fire before the per-user
		// rate limiter records a new row.
		const second = await SELF.fetch("http://localhost/v1/user", {
			headers: { Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}` },
		});
		expect(second.status).toBe(429);
		const retryAfter = Number(second.headers.get("Retry-After"));
		expect(retryAfter).toBeGreaterThan(0);

		const after = await env.DB.prepare(
			"SELECT COUNT(*) as cnt FROM rate_limits WHERE key = ?",
		)
			.bind(`user:${TEST_FREE_USER_ID}`)
			.first<{ cnt: number }>();
		expect(after?.cnt).toBe(beforeCount); // No new D1 row inserted.
	});

	it("does not run on non-/logs routes (middleware is path-scoped)", async () => {
		// Pre-fill the per-user rate-limit table to over-budget. If the
		// middleware were still mounted globally, the next authenticated
		// request to ANY route would 429. Scoped to /logs only, a request
		// to /v1/user must succeed — and crucially, no block-list entry
		// gets written either, because the middleware never runs.
		const { maxRequests, windowMs } = TIER_LIMITS.free.apiRateLimit;
		await seedRateLimits(maxRequests, windowMs);

		const beforeBlock = await env.CACHE.get(BLOCK_KEY);
		expect(beforeBlock).toBeNull();

		const resp = await SELF.fetch("http://localhost/v1/user", {
			headers: { Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}` },
		});

		// /v1/user/me is the user-router root — anything non-429 is fine here;
		// what we're proving is the rate limiter didn't fire.
		expect(resp.status).not.toBe(429);

		// And no block was written, since the rate limiter never ran.
		const afterBlock = await env.CACHE.get(BLOCK_KEY);
		expect(afterBlock).toBeNull();
	});
});
