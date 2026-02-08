// Minimal type stubs for Cloudflare Workers runtime types.
// At runtime this module runs inside workerd which provides them natively.
interface DurableObjectNamespace {
	idFromName(name: string): { toString(): string };
	get(id: { toString(): string }): {
		fetch(request: Request): Promise<Response>;
	};
}

interface Env {
	ASSETS: { fetch(request: Request | string): Promise<Response> };
	DEVICES: string; // JSON array of device IDs, injected as a text binding
	[key: string]: unknown; // DO namespace bindings (e.g., "my-device")
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// WebSocket proxy: /ws/:deviceId
		const wsMatch = url.pathname.match(/^\/ws\/(.+)$/);
		if (wsMatch) {
			return handleWebSocket(request, env, wsMatch[1]);
		}

		// API: list configured devices
		if (url.pathname === "/api/devices") {
			const devices = JSON.parse(env.DEVICES || "[]");
			return new Response(JSON.stringify({ devices }), {
				headers: { "Content-Type": "application/json" },
			});
		}

		// Static asset serving
		return serveStaticAsset(url, env);
	},
};

async function handleWebSocket(
	request: Request,
	env: Env,
	deviceId: string,
): Promise<Response> {
	const upgradeHeader = request.headers.get("Upgrade");
	if (!upgradeHeader || upgradeHeader !== "websocket") {
		return new Response("Expected Upgrade: websocket", { status: 426 });
	}

	// Look up the DO namespace binding for this device
	const doNamespace = env[deviceId] as DurableObjectNamespace | undefined;
	if (!doNamespace) {
		return new Response(`Unknown device: ${deviceId}`, { status: 404 });
	}

	// Get a stable stub by device name
	const stubId = doNamespace.idFromName(deviceId);
	const stub = doNamespace.get(stubId);

	// Forward the WebSocket upgrade to the DO
	const doUrl = new URL(request.url);
	doUrl.pathname = `/websocket`;
	doUrl.searchParams.set("deviceId", deviceId);

	return stub.fetch(
		new Request(doUrl.toString(), {
			headers: request.headers,
		}),
	);
}

async function serveStaticAsset(url: URL, env: Env): Promise<Response> {
	let assetPath = url.pathname;
	if (assetPath === "/") {
		assetPath = "index.html";
	}

	// Guess content type
	let contentType = "text/html; charset=utf-8";
	if (assetPath.endsWith(".css")) {
		contentType = "text/css";
	} else if (assetPath.endsWith(".json")) {
		contentType = "application/json";
	} else if (assetPath.endsWith(".js")) {
		contentType = "application/javascript";
	} else if (assetPath.endsWith(".ico")) {
		contentType = "image/x-icon";
	} else if (assetPath.endsWith(".svg")) {
		contentType = "image/svg+xml";
	} else if (assetPath.endsWith(".png")) {
		contentType = "image/png";
	} else if (assetPath.endsWith(".woff2")) {
		contentType = "font/woff2";
	}

	const resp = await env.ASSETS.fetch(`http://localhost:8080/${assetPath}`);

	if (!resp.ok) {
		// SPA fallback: serve index.html for non-file paths
		const fallback = await env.ASSETS.fetch(
			"http://localhost:8080/index.html",
		);
		return new Response(fallback.body, {
			headers: { "content-type": "text/html; charset=utf-8" },
			status: fallback.ok ? 200 : 404,
		});
	}

	return new Response(resp.body, {
		headers: { "content-type": contentType },
		status: resp.status,
	});
}
