import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

// A ctx.exports facet handed to the dynamic worker (mirrors a real "call back
// into the DO" binding). The fan-out we see is the cached stub's method trying
// to reach this after the child isolate that owned the stub is gone.
export class Back extends WorkerEntrypoint {
	async echo(s: string) {
		return `echo:${s}`;
	}
}

// The dynamic (Worker Loader) module. getTarget() returns a plain object of
// methods - the parent-side reference to it is the RPC stub we (mis)cache.
const DYNAMIC_WORKER_SRC = `
import { WorkerEntrypoint } from "cloudflare:workers";
export class ProxyEntrypoint extends WorkerEntrypoint {
  getTarget() {
    const back = this.env.BACK;
    return { ping: async () => back.echo("pong") };
  }
}`;

export class StaleStubDO extends DurableObject {
	private cached: { ping(): Promise<string> } | null = null;
	private cachedAt = 0;

	private async resolveStub(): Promise<{ ping(): Promise<string> }> {
		// biome-ignore lint/suspicious/noExplicitAny: repro kept dependency-light
		const back = (this.ctx as any).exports.Back(); // facet for the child
		// biome-ignore lint/suspicious/noExplicitAny: repro kept dependency-light
		const worker = (this.env as any).LOADER.get("repro-worker", async () => ({
			compatibilityDate: "2026-04-24",
			mainModule: "main.js",
			modules: { "main.js": DYNAMIC_WORKER_SRC },
			env: { BACK: back },
			globalOutbound: null,
		}));
		const ep = worker.getEntrypoint("ProxyEntrypoint") as {
			getTarget(): Promise<{ ping(): Promise<string> }>;
		};
		return await ep.getTarget();
	}

	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);

		// Invocation A: resolve + cache the stub, then this invocation ENDS.
		if (url.pathname === "/resolve") {
			this.cached = await this.resolveStub();
			this.cachedAt = Date.now();
			return Response.json({ resolved: true });
		}

		// Invocation B (separate request): call a method on the stub.
		//   mode=cached -> the cross-invocation stub   -> hangs ~60s / "Too many subrequests"
		//   mode=fresh  -> re-resolved this invocation -> returns fast (control)
		if (url.pathname === "/call") {
			const mode = url.searchParams.get("mode") ?? "cached";
			const stub = mode === "fresh" ? await this.resolveStub() : this.cached;
			if (!stub) {
				return Response.json({ error: "GET /resolve first" }, { status: 400 });
			}
			const t0 = Date.now();
			try {
				const result = await stub.ping();
				return Response.json({
					mode,
					result,
					ms: Date.now() - t0,
					stubAgeMs: Date.now() - this.cachedAt,
				});
			} catch (e) {
				return Response.json(
					{ mode, error: String(e), ms: Date.now() - t0 },
					{ status: 500 },
				);
			}
		}

		return new Response("routes: /resolve , /call?mode=cached|fresh", {
			status: 404,
		});
	}
}

export default {
	async fetch(req: Request, env: { DO: DurableObjectNamespace }): Promise<Response> {
		return env.DO.get(env.DO.idFromName("singleton")).fetch(req);
	},
};
