import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { hashToken } from "../../src/foundation/tokenHash";
import { TEST_SESSION_TOKEN, TEST_USER_ID } from "../setup-test-data";

async function clearCache(token: string): Promise<void> {
	const hash = await hashToken(token);
	// Both layers must be cleared — L1 (caches.default, per-colo) is separate
	// from L2 (KV). The TieredCache.delete() helper does both, but we hit each
	// directly here so the test stays decoupled from internal helpers.
	await env.CACHE.delete(`auth:${hash}`);
	try {
		await caches.default.delete(
			new Request(
				`https://cache.internal/${encodeURIComponent("auth")}/${encodeURIComponent(hash)}`,
			),
		);
	} catch {
		/* best-effort */
	}
}

describe("Auth cache (TieredCache-backed)", () => {
	afterEach(async () => {
		await clearCache(TEST_SESSION_TOKEN);
	});

	it("first authenticated request populates the cache", async () => {
		await clearCache(TEST_SESSION_TOKEN);

		const resp = await SELF.fetch("http://localhost/v1/projects", {
			headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
		});
		expect(resp.status).toBe(200);

		// waitUntil writes the cache entry — poll briefly for it.
		const hash = await hashToken(TEST_SESSION_TOKEN);
		let cached: { id: string } | null = null;
		for (let i = 0; i < 20 && !cached; i++) {
			await new Promise((r) => setTimeout(r, 25));
			cached = await env.CACHE.get<{ id: string }>(`auth:${hash}`, "json");
		}
		expect(cached).not.toBeNull();
		expect(cached?.id).toBe(TEST_USER_ID);
	});

	it("a cached token still authenticates after the underlying session row is deleted (until invalidated)", async () => {
		// Prime the cache.
		const first = await SELF.fetch("http://localhost/v1/projects", {
			headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
		});
		expect(first.status).toBe(200);

		// Wait for the waitUntil cache write to land.
		const hash = await hashToken(TEST_SESSION_TOKEN);
		for (let i = 0; i < 20; i++) {
			const peek = await env.CACHE.get(`auth:${hash}`);
			if (peek) break;
			await new Promise((r) => setTimeout(r, 25));
		}

		// Delete the session from D1 — without the cache, this would 401.
		await env.DB.prepare("DELETE FROM user_sessions WHERE token = ?")
			.bind(TEST_SESSION_TOKEN)
			.run();

		const second = await SELF.fetch("http://localhost/v1/projects", {
			headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
		});
		// Cache hit returns the user → 200. Documented trade-off: revoked
		// tokens may continue working for up to 60 s in the colo where they
		// were last cached.
		expect(second.status).toBe(200);

		// After invalidation, the next request hits D1 and 401s.
		await clearCache(TEST_SESSION_TOKEN);
		const third = await SELF.fetch("http://localhost/v1/projects", {
			headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
		});
		expect(third.status).toBe(401);

		// Restore the session row so other tests aren't affected.
		const now = Date.now();
		await env.DB.prepare(
			"INSERT INTO user_sessions (user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?)",
		)
			.bind(TEST_USER_ID, TEST_SESSION_TOKEN, now, now + 86400000)
			.run();
	});

	it("missing CACHE binding does not break auth (fail-open)", async () => {
		// We can't easily un-bind CACHE inside vitest-pool-workers, but the
		// authCache helpers all check for `c.env.CACHE` truthiness. Verifying
		// the success path here ensures the wiring is correct; the unit-level
		// fail-open behaviour is exercised by tieredCache.test.ts and by
		// userBlockList.test.ts (Sentry-captured + return).
		const resp = await SELF.fetch("http://localhost/v1/projects", {
			headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
		});
		expect(resp.status).toBe(200);
	});
});
