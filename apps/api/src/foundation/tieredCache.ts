/**
 * Two-tier cache backed by:
 *   L1 — `caches.default` (Cloudflare Cache API, per-colo, sub-millisecond hits).
 *   L2 — a KV namespace, read with `cacheTtl: 60` so KV's own colo cache also
 *        absorbs reads on L1 miss before falling through to KV's central store.
 *
 * Reads check L1 first; on miss they fall through to L2 and back-fill L1 via
 * `ctx.waitUntil` so the next request in this colo lands on L1.
 *
 * Writes go to L2 first (the source of truth across colos) and then back-fill
 * L1. L1 `max-age` is clamped to `min(ttlSec, 60)` because Cache API entries
 * are colo-local — anything longer drifts out of sync with L2 evictions.
 *
 * Deletes remove from L2 and from the local colo's L1. Other colos rely on the
 * L1 max-age to expire naturally; combined with the L2 delete, the worst-case
 * staleness is ~60 s.
 *
 * Multiple consumers share one KV namespace by passing different `namespace`
 * strings — keys become `${namespace}:${key}` in KV and are scoped under
 * `https://cache.internal/${namespace}/...` URLs in L1.
 */
export class TieredCache {
	constructor(
		private readonly kv: KVNamespace,
		private readonly namespace: string,
		private readonly ctx: { waitUntil(promise: Promise<unknown>): void },
	) {}

	/**
	 * Read a JSON-serialisable value through L1 then L2. Returns `null` if both
	 * layers miss. L1 errors are swallowed (best-effort cache); L2 errors bubble
	 * to the caller so middleware can fail open and Sentry-capture.
	 */
	async get<V>(key: string): Promise<V | null> {
		const req = this.cacheRequest(key);

		try {
			const cached = await caches.default.match(req);
			if (cached) {
				try {
					return (await cached.json()) as V;
				} catch {
					// Corrupted L1 entry — fall through to L2.
				}
			}
		} catch {
			// L1 read failures are best-effort.
		}

		const fromKv = await this.kv.get<V>(this.kvKey(key), {
			type: "json",
			cacheTtl: 60,
		});
		if (fromKv === null) return null;

		this.ctx.waitUntil(this.writeL1(req, fromKv, 60));
		return fromKv;
	}

	/**
	 * Write a value to L2 (replicated, the source of truth) and back-fill L1.
	 * L1 `max-age` is clamped to 60 s so a stale L1 entry can never outlive an
	 * L2 deletion by more than a minute.
	 */
	async set<V>(key: string, value: V, opts: { ttlSec: number }): Promise<void> {
		// KV's minimum expirationTtl is 60 s (anything lower throws).
		const ttlSec = Math.max(opts.ttlSec, 60);

		await this.kv.put(this.kvKey(key), JSON.stringify(value), {
			expirationTtl: ttlSec,
		});

		this.ctx.waitUntil(
			this.writeL1(this.cacheRequest(key), value, Math.min(ttlSec, 60)),
		);
	}

	/**
	 * Delete from L2 and from this colo's L1. Other colos eat the L1 `max-age`
	 * (≤60 s) before they re-read from L2.
	 */
	async delete(key: string): Promise<void> {
		await this.kv.delete(this.kvKey(key));
		this.ctx.waitUntil(
			caches.default.delete(this.cacheRequest(key)).catch(() => undefined),
		);
	}

	private cacheRequest(key: string): Request {
		// Synthetic URL — Cache API keys requests, not strings. The host is
		// arbitrary; only the path needs to be unique across cache consumers.
		return new Request(
			`https://cache.internal/${encodeURIComponent(this.namespace)}/${encodeURIComponent(key)}`,
		);
	}

	private kvKey(key: string): string {
		return `${this.namespace}:${key}`;
	}

	private async writeL1<V>(
		req: Request,
		value: V,
		maxAgeSec: number,
	): Promise<void> {
		try {
			await caches.default.put(
				req,
				new Response(JSON.stringify(value), {
					headers: {
						"Content-Type": "application/json",
						"Cache-Control": `max-age=${maxAgeSec}`,
					},
				}),
			);
		} catch {
			// Best-effort — L1 is a perf optimisation, not durability.
		}
	}
}
