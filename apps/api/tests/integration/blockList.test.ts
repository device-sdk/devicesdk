import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { TEST_SESSION_TOKEN, TEST_USER_ID } from "../setup-test-data";

const BLOCK_KEY = `block:user:${TEST_USER_ID}`;

async function clearBlock(): Promise<void> {
	await env.CACHE.delete(BLOCK_KEY);
	// TieredCache backs the middleware with caches.default as L1; purge it too
	// so a stale entry from a previous test doesn't survive the KV delete. URL
	// must match TieredCache.cacheRequest's encodeURIComponent path layout.
	await caches.default.delete(
		new Request(
			`https://cache.internal/block/${encodeURIComponent(`user:${TEST_USER_ID}`)}`,
		),
	);
}

describe("Cross-route block list (userBlockListMiddleware)", () => {
	afterEach(clearBlock);

	it("returns 429 with Retry-After when an unexpired block is set", async () => {
		const until = Date.now() + 3_600_000; // 1 hour
		await env.CACHE.put(
			BLOCK_KEY,
			JSON.stringify({ reason: "rate-limit", until, path: "/v1/projects" }),
		);

		const resp = await SELF.fetch("http://localhost/v1/projects", {
			headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
		});

		expect(resp.status).toBe(429);
		const retryAfter = Number(resp.headers.get("Retry-After"));
		expect(retryAfter).toBeGreaterThan(0);
		// 1 hour minus a few seconds of test wall-clock noise
		expect(retryAfter).toBeLessThanOrEqual(3600);
		expect(retryAfter).toBeGreaterThan(3500);

		const body = (await resp.json()) as {
			success: boolean;
			error: string;
			code: string;
		};
		expect(body.success).toBe(false);
		expect(body.code).toBe("rate-limit");
	});

	it("ignores expired blocks (until in the past) and lets the request through", async () => {
		await env.CACHE.put(
			BLOCK_KEY,
			JSON.stringify({ reason: "rate-limit", until: Date.now() - 1000 }),
		);

		const resp = await SELF.fetch("http://localhost/v1/projects", {
			headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
		});

		expect(resp.status).not.toBe(429);
	});

	it("blocks every authenticated route, not just the one that tripped", async () => {
		const until = Date.now() + 60_000;
		await env.CACHE.put(
			BLOCK_KEY,
			JSON.stringify({
				reason: "rate-limit",
				until,
				path: "/v1/projects/foo/devices/bar/logs",
			}),
		);

		// A different route entirely — block must still apply.
		const resp = await SELF.fetch("http://localhost/v1/user", {
			headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
		});

		expect(resp.status).toBe(429);
	});

	it("does not block when the user has no entry", async () => {
		const resp = await SELF.fetch("http://localhost/v1/projects", {
			headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
		});
		expect(resp.status).not.toBe(429);
	});

	it("does not run for unauthenticated requests (no user in context)", async () => {
		// No Authorization header — auth middleware returns 401 before block list
		// has anything to look up. The middleware short-circuits on missing user.
		const resp = await SELF.fetch("http://localhost/v1/projects");
		expect(resp.status).toBe(401);
	});
});
