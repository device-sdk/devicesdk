import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { TieredCache } from "../../src/foundation/tieredCache";

// vitest-pool-workers gives us a real KV binding via wrangler.jsonc + a real
// `caches.default` from miniflare. The class is exercised against both layers.

interface Probe {
	id: string;
	value: number;
}

const NAMESPACE = "test";

function ctx(): ExecutionContext {
	// Minimal stub — vitest-pool-workers does not expose the worker's
	// ExecutionContext directly, but waitUntil only needs to await the promise.
	const pending: Promise<unknown>[] = [];
	return {
		waitUntil(p: Promise<unknown>) {
			pending.push(p);
		},
		passThroughOnException() {},
		props: {},
		// Helper for tests to drain background work before assertions.
		async drain() {
			await Promise.allSettled(pending);
		},
	} as unknown as ExecutionContext & { drain(): Promise<void> };
}

async function drain(c: ExecutionContext): Promise<void> {
	await (c as ExecutionContext & { drain(): Promise<void> }).drain();
}

async function clearKey(key: string): Promise<void> {
	await env.CACHE.delete(`${NAMESPACE}:${key}`);
	try {
		await caches.default.delete(
			new Request(
				`https://cache.internal/${encodeURIComponent(NAMESPACE)}/${encodeURIComponent(key)}`,
			),
		);
	} catch {
		// Best-effort.
	}
}

describe("TieredCache", () => {
	afterEach(async () => {
		await clearKey("alpha");
		await clearKey("beta");
		await clearKey("gamma");
	});

	it("returns null when both layers miss", async () => {
		const c = ctx();
		const cache = new TieredCache(env.CACHE, NAMESPACE, c);
		expect(await cache.get<Probe>("alpha")).toBeNull();
	});

	it("set writes both layers and a subsequent get hits L1", async () => {
		const c = ctx();
		const cache = new TieredCache(env.CACHE, NAMESPACE, c);
		await cache.set<Probe>("alpha", { id: "a", value: 1 }, { ttlSec: 60 });
		await drain(c);

		// Verify L2
		const fromKv = await env.CACHE.get<Probe>(`${NAMESPACE}:alpha`, "json");
		expect(fromKv).toEqual({ id: "a", value: 1 });

		// Verify L1
		const cached = await caches.default.match(
			new Request(
				`https://cache.internal/${encodeURIComponent(NAMESPACE)}/${encodeURIComponent("alpha")}`,
			),
		);
		expect(cached).toBeDefined();
		const cachedJson = (await cached?.json()) as Probe;
		expect(cachedJson).toEqual({ id: "a", value: 1 });

		// And get returns the value.
		expect(await cache.get<Probe>("alpha")).toEqual({ id: "a", value: 1 });
	});

	it("L1 miss + L2 hit back-fills L1", async () => {
		const c = ctx();
		// Seed L2 only.
		await env.CACHE.put(
			`${NAMESPACE}:beta`,
			JSON.stringify({ id: "b", value: 2 }),
		);

		const cache = new TieredCache(env.CACHE, NAMESPACE, c);
		expect(await cache.get<Probe>("beta")).toEqual({ id: "b", value: 2 });

		await drain(c);

		// L1 should now be populated.
		const cached = await caches.default.match(
			new Request(
				`https://cache.internal/${encodeURIComponent(NAMESPACE)}/${encodeURIComponent("beta")}`,
			),
		);
		expect(cached).toBeDefined();
	});

	it("delete removes both layers", async () => {
		const c = ctx();
		const cache = new TieredCache(env.CACHE, NAMESPACE, c);
		await cache.set<Probe>("gamma", { id: "g", value: 3 }, { ttlSec: 60 });
		await drain(c);

		expect(await cache.get<Probe>("gamma")).toEqual({ id: "g", value: 3 });

		await cache.delete("gamma");
		await drain(c);

		expect(await env.CACHE.get(`${NAMESPACE}:gamma`)).toBeNull();
		const cached = await caches.default.match(
			new Request(
				`https://cache.internal/${encodeURIComponent(NAMESPACE)}/${encodeURIComponent("gamma")}`,
			),
		);
		expect(cached).toBeUndefined();
	});

	it("namespace isolation: same key in different namespaces does not collide", async () => {
		const c = ctx();
		const a = new TieredCache(env.CACHE, "ns-a", c);
		const b = new TieredCache(env.CACHE, "ns-b", c);
		await a.set<Probe>("key", { id: "from-a", value: 1 }, { ttlSec: 60 });
		await b.set<Probe>("key", { id: "from-b", value: 2 }, { ttlSec: 60 });
		await drain(c);

		expect(await a.get<Probe>("key")).toEqual({ id: "from-a", value: 1 });
		expect(await b.get<Probe>("key")).toEqual({ id: "from-b", value: 2 });

		// Cleanup
		await a.delete("key");
		await b.delete("key");
		await drain(c);
	});
});
