import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer, type TestUser } from "../harness";

function form(fields: Record<string, string>): string {
	return new URLSearchParams(fields).toString();
}

function oauthCsrfCookie(headers: Headers): string {
	const raw = headers.get("set-cookie") ?? "";
	const m = raw.match(/oauth_csrf=([^;]+)/);
	if (!m) throw new Error(`no oauth_csrf cookie in: ${raw}`);
	return decodeURIComponent(m[1]);
}

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

async function generatePkcePair(): Promise<{
	verifier: string;
	challenge: string;
}> {
	const verifierBytes = new Uint8Array(32);
	crypto.getRandomValues(verifierBytes);
	const verifier = base64UrlEncode(verifierBytes);
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(verifier),
	);
	const challenge = base64UrlEncode(new Uint8Array(digest));
	return { verifier, challenge };
}

interface RegisteredClient {
	client_id: string;
	client_name: string;
	redirect_uris: string[];
}

async function registerClient(
	srv: TestServer,
	redirectUri = "http://localhost:9999/cb",
	clientName = "test client",
): Promise<RegisteredClient> {
	const res = await srv.post("/oauth/register", {
		body: { client_name: clientName, redirect_uris: [redirectUri] },
	});
	if (res.status !== 201) {
		throw new Error(`register client failed: ${res.status} ${res.text}`);
	}
	return res.body as RegisteredClient;
}

/**
 * Drives GET /oauth/authorize (consent page + CSRF cookie) then POST
 * /oauth/authorize (approve/deny). Returns the final response so callers can
 * inspect status/Location without this helper hiding failures.
 */
async function driveAuthorize(
	srv: TestServer,
	token: string,
	params: {
		clientId: string;
		redirectUri: string;
		codeChallenge: string;
		state?: string;
	},
	action: "approve" | "deny" = "approve",
): Promise<{ status: number; location: string | null; bodyText: string }> {
	const query: Record<string, string> = {
		response_type: "code",
		client_id: params.clientId,
		redirect_uri: params.redirectUri,
		code_challenge: params.codeChallenge,
		code_challenge_method: "S256",
	};
	if (params.state !== undefined) query.state = params.state;

	const page = await srv.get("/oauth/authorize", { token, query });
	if (page.status !== 200) {
		return { status: page.status, location: null, bodyText: page.text };
	}
	const csrf = oauthCsrfCookie(page.headers);

	const post = await srv.post("/oauth/authorize", {
		token,
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Cookie: `oauth_csrf=${csrf}`,
		},
		rawBody: form({ ...query, csrf_token: csrf, action }),
	});
	return {
		status: post.status,
		location: post.headers.get("location"),
		bodyText: post.text,
	};
}

function codeFromLocation(location: string | null): string {
	if (!location) throw new Error("no Location header");
	const url = new URL(location);
	const code = url.searchParams.get("code");
	if (!code) throw new Error(`no code in Location: ${location}`);
	return code;
}

interface TokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
}

async function exchangeCode(
	srv: TestServer,
	params: {
		code: string;
		redirectUri: string;
		clientId: string;
		codeVerifier: string;
	},
) {
	return srv.post("/oauth/token", {
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		rawBody: form({
			grant_type: "authorization_code",
			code: params.code,
			redirect_uri: params.redirectUri,
			client_id: params.clientId,
			code_verifier: params.codeVerifier,
		}),
	});
}

describe("oauth: discovery metadata", () => {
	let srv: TestServer;
	beforeAll(async () => {
		srv = await TestServer.start();
	});
	afterAll(() => srv.stop());

	test("authorization-server metadata: issuer matches the request origin", async () => {
		const res = await srv.get("/.well-known/oauth-authorization-server");
		expect(res.status).toBe(200);
		const body = res.body as Record<string, unknown>;
		expect(body.issuer).toBe(srv.baseUrl);
		expect(body.authorization_endpoint).toBe(`${srv.baseUrl}/oauth/authorize`);
		expect(body.token_endpoint).toBe(`${srv.baseUrl}/oauth/token`);
		expect(body.registration_endpoint).toBe(`${srv.baseUrl}/oauth/register`);
		expect(body.code_challenge_methods_supported).toEqual(["S256"]);
		expect(body.token_endpoint_auth_methods_supported).toEqual(["none"]);
	});

	test("protected-resource metadata points at /mcp on this origin", async () => {
		const res = await srv.get("/.well-known/oauth-protected-resource");
		expect(res.status).toBe(200);
		const body = res.body as Record<string, unknown>;
		expect(body.resource).toBe(`${srv.baseUrl}/mcp`);
		expect(body.authorization_servers).toEqual([srv.baseUrl]);
	});

	test("protected-resource metadata is also served at the /mcp-suffixed path", async () => {
		const res = await srv.get("/.well-known/oauth-protected-resource/mcp");
		expect(res.status).toBe(200);
		expect((res.body as Record<string, unknown>).resource).toBe(
			`${srv.baseUrl}/mcp`,
		);
	});
});

describe("oauth: dynamic client registration", () => {
	let srv: TestServer;
	beforeAll(async () => {
		srv = await TestServer.start();
	});
	afterAll(() => srv.stop());

	test("happy path: 201 with a client_id and echoed metadata", async () => {
		const res = await srv.post("/oauth/register", {
			body: {
				client_name: "curl test",
				redirect_uris: ["http://localhost:9999/cb"],
			},
		});
		expect(res.status).toBe(201);
		const body = res.body as RegisteredClient & {
			token_endpoint_auth_method: string;
		};
		expect(typeof body.client_id).toBe("string");
		expect(body.client_name).toBe("curl test");
		expect(body.redirect_uris).toEqual(["http://localhost:9999/cb"]);
		expect(body.token_endpoint_auth_method).toBe("none");
	});

	test("bad redirect_uri -> 400 invalid_client_metadata", async () => {
		const res = await srv.post("/oauth/register", {
			body: { client_name: "bad", redirect_uris: ["notaurl"] },
		});
		expect(res.status).toBe(400);
		expect((res.body as { error: string }).error).toBe(
			"invalid_client_metadata",
		);
	});

	test("missing redirect_uris -> 400 invalid_client_metadata", async () => {
		const res = await srv.post("/oauth/register", {
			body: { client_name: "no redirects" },
		});
		expect(res.status).toBe(400);
		expect((res.body as { error: string }).error).toBe(
			"invalid_client_metadata",
		);
	});

	test("client_name is required - omitted -> 400 invalid_client_metadata", async () => {
		const res = await srv.post("/oauth/register", {
			body: { redirect_uris: ["https://example.com/cb"] },
		});
		expect(res.status).toBe(400);
		expect((res.body as { error: string }).error).toBe(
			"invalid_client_metadata",
		);
	});

	test("scriptable schemes (javascript:, data:) -> 400 invalid_client_metadata", async () => {
		for (const uri of ["javascript:alert(1)", "data:text/html,hi"]) {
			const res = await srv.post("/oauth/register", {
				body: { client_name: "xss", redirect_uris: [uri] },
			});
			expect(res.status).toBe(400);
			expect((res.body as { error: string }).error).toBe(
				"invalid_client_metadata",
			);
		}
	});

	test("http on a non-loopback host -> 400 invalid_client_metadata", async () => {
		for (const uri of [
			"http://example.com/cb",
			"http://192.168.1.50/cb",
			"http://example.com@localhost/cb",
		]) {
			const res = await srv.post("/oauth/register", {
				body: { client_name: "http client", redirect_uris: [uri] },
			});
			expect(res.status).toBe(400);
			expect((res.body as { error: string }).error).toBe(
				"invalid_client_metadata",
			);
		}
	});

	test("https (any host) and loopback http (any port) are accepted", async () => {
		for (const uri of [
			"https://example.com/cb",
			"https://example.com:8443/cb",
			"http://localhost:9999/cb",
			"http://127.0.0.1:8080/cb",
			"http://[::1]:3000/cb",
		]) {
			const res = await srv.post("/oauth/register", {
				body: { client_name: "ok client", redirect_uris: [uri] },
			});
			expect(res.status).toBe(201);
		}
	});
});

describe("oauth: full authorization code + PKCE flow", () => {
	let srv: TestServer;
	let user: TestUser;
	let client: RegisteredClient;
	const redirectUri = "http://localhost:9999/cb";

	beforeAll(async () => {
		srv = await TestServer.start();
		user = await srv.register({
			email: `oauth-flow-${crypto.randomUUID()}@example.com`,
		});
		client = await registerClient(srv, redirectUri, "flow client");
	});
	afterAll(() => srv.stop());

	test("approve -> redirect with code + state -> token exchange -> access token works on /mcp", async () => {
		const { verifier, challenge } = await generatePkcePair();
		const auth = await driveAuthorize(srv, user.token, {
			clientId: client.client_id,
			redirectUri,
			codeChallenge: challenge,
			state: "xyz123",
		});
		expect(auth.status).toBe(302);
		const location = new URL(auth.location ?? "");
		expect(location.origin + location.pathname).toBe(redirectUri);
		expect(location.searchParams.get("state")).toBe("xyz123");
		const code = codeFromLocation(auth.location);

		const tokenRes = await exchangeCode(srv, {
			code,
			redirectUri,
			clientId: client.client_id,
			codeVerifier: verifier,
		});
		expect(tokenRes.status).toBe(200);
		const tokenBody = tokenRes.body as TokenResponse;
		expect(tokenBody.token_type).toBe("Bearer");
		expect(tokenBody.expires_in).toBe(2592000);
		expect(typeof tokenBody.access_token).toBe("string");

		const mcpRes = await srv.post("/mcp", {
			token: tokenBody.access_token,
			body: {
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name: "devicesdk_whoami", arguments: {} },
			},
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
		});
		expect(mcpRes.status).toBe(200);
	});

	test("code is single-use: reusing it -> invalid_grant", async () => {
		const { verifier, challenge } = await generatePkcePair();
		const auth = await driveAuthorize(srv, user.token, {
			clientId: client.client_id,
			redirectUri,
			codeChallenge: challenge,
		});
		const code = codeFromLocation(auth.location);

		const first = await exchangeCode(srv, {
			code,
			redirectUri,
			clientId: client.client_id,
			codeVerifier: verifier,
		});
		expect(first.status).toBe(200);

		const second = await exchangeCode(srv, {
			code,
			redirectUri,
			clientId: client.client_id,
			codeVerifier: verifier,
		});
		expect(second.status).toBe(400);
		expect((second.body as { error: string }).error).toBe("invalid_grant");
	});

	test("concurrent double-exchange of the same code: exactly one succeeds", async () => {
		const { verifier, challenge } = await generatePkcePair();
		const auth = await driveAuthorize(srv, user.token, {
			clientId: client.client_id,
			redirectUri,
			codeChallenge: challenge,
		});
		const code = codeFromLocation(auth.location);

		// Fire both exchanges before either resolves: the DELETE ... RETURNING
		// consume is atomic, so exactly one of the two must win the code.
		const [a, b] = await Promise.all([
			exchangeCode(srv, {
				code,
				redirectUri,
				clientId: client.client_id,
				codeVerifier: verifier,
			}),
			exchangeCode(srv, {
				code,
				redirectUri,
				clientId: client.client_id,
				codeVerifier: verifier,
			}),
		]);
		const statuses = [a.status, b.status].sort((x, y) => x - y);
		expect(statuses).toEqual([200, 400]);
		const loser = a.status === 200 ? b : a;
		expect((loser.body as { error: string }).error).toBe("invalid_grant");
	});

	test("expired code -> invalid_grant", async () => {
		const { verifier, challenge } = await generatePkcePair();
		const auth = await driveAuthorize(srv, user.token, {
			clientId: client.client_id,
			redirectUri,
			codeChallenge: challenge,
		});
		const code = codeFromLocation(auth.location);

		// Force-expire the just-issued code directly in the test DB (the
		// harness exposes the raw bun:sqlite handle for exactly this).
		const row = srv.db
			.query(
				"SELECT id FROM oauth_auth_codes WHERE client_id = ?1 ORDER BY created_at DESC LIMIT 1",
			)
			.get(client.client_id) as { id: string };
		srv.db.run("UPDATE oauth_auth_codes SET expires_at = ?1 WHERE id = ?2", [
			Date.now() - 1000,
			row.id,
		]);

		const res = await exchangeCode(srv, {
			code,
			redirectUri,
			clientId: client.client_id,
			codeVerifier: verifier,
		});
		expect(res.status).toBe(400);
		expect((res.body as { error: string }).error).toBe("invalid_grant");
	});

	test("wrong code_verifier -> invalid_grant", async () => {
		const { challenge } = await generatePkcePair();
		const auth = await driveAuthorize(srv, user.token, {
			clientId: client.client_id,
			redirectUri,
			codeChallenge: challenge,
		});
		const code = codeFromLocation(auth.location);

		const res = await exchangeCode(srv, {
			code,
			redirectUri,
			clientId: client.client_id,
			// A wrong verifier that still satisfies the RFC 7636 length rules,
			// so it reaches the PKCE comparison instead of the length check.
			codeVerifier: "totally-the-wrong-verifier-value-12345-6789",
		});
		expect(res.status).toBe(400);
		expect((res.body as { error: string }).error).toBe("invalid_grant");
	});

	test("mismatched redirect_uri at token exchange -> invalid_grant", async () => {
		const { verifier, challenge } = await generatePkcePair();
		const auth = await driveAuthorize(srv, user.token, {
			clientId: client.client_id,
			redirectUri,
			codeChallenge: challenge,
		});
		const code = codeFromLocation(auth.location);

		const res = await exchangeCode(srv, {
			code,
			redirectUri: "http://localhost:9999/DIFFERENT",
			clientId: client.client_id,
			codeVerifier: verifier,
		});
		expect(res.status).toBe(400);
		expect((res.body as { error: string }).error).toBe("invalid_grant");
	});

	test("deny -> redirect with error=access_denied, no code minted", async () => {
		const { challenge } = await generatePkcePair();
		const auth = await driveAuthorize(
			srv,
			user.token,
			{
				clientId: client.client_id,
				redirectUri,
				codeChallenge: challenge,
				state: "denystate",
			},
			"deny",
		);
		expect(auth.status).toBe(302);
		const location = new URL(auth.location ?? "");
		expect(location.searchParams.get("error")).toBe("access_denied");
		expect(location.searchParams.get("state")).toBe("denystate");
		expect(location.searchParams.has("code")).toBe(false);
	});

	test("consent page shows client_id and redirect_uri so the user can identify the client", async () => {
		const { challenge } = await generatePkcePair();
		const page = await srv.get("/oauth/authorize", {
			token: user.token,
			query: {
				response_type: "code",
				client_id: client.client_id,
				redirect_uri: redirectUri,
				code_challenge: challenge,
				code_challenge_method: "S256",
			},
		});
		expect(page.status).toBe(200);
		expect(page.text).toContain(client.client_id);
		expect(page.text).toContain(redirectUri);
	});

	test("unknown client_id or unregistered redirect_uri renders an error page, not a redirect", async () => {
		const res = await srv.get("/oauth/authorize", {
			token: user.token,
			query: {
				response_type: "code",
				client_id: "00000000-0000-0000-0000-000000000000",
				redirect_uri: redirectUri,
				code_challenge: "x".repeat(43),
				code_challenge_method: "S256",
			},
		});
		expect(res.status).toBe(400);
		expect(res.headers.get("location")).toBeNull();
	});

	test("GET /oauth/authorize unauthenticated redirects to login", async () => {
		const res = await srv.get("/oauth/authorize", {
			query: {
				response_type: "code",
				client_id: client.client_id,
				redirect_uri: redirectUri,
				code_challenge: "x".repeat(43),
				code_challenge_method: "S256",
			},
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toContain("/login");
	});
});

describe("oauth: minted token lifecycle", () => {
	let srv: TestServer;
	let user: TestUser;
	let client: RegisteredClient;
	const redirectUri = "http://localhost:9999/cb";

	beforeAll(async () => {
		srv = await TestServer.start();
		user = await srv.register({
			email: `oauth-lifecycle-${crypto.randomUUID()}@example.com`,
		});
		client = await registerClient(srv, redirectUri, "lifecycle client");
	});
	afterAll(() => srv.stop());

	test("minted token is listed in /v1/tokens as managed with an MCP description, and revocation locks out /mcp", async () => {
		const { verifier, challenge } = await generatePkcePair();
		const auth = await driveAuthorize(srv, user.token, {
			clientId: client.client_id,
			redirectUri,
			codeChallenge: challenge,
		});
		const code = codeFromLocation(auth.location);
		const tokenRes = await exchangeCode(srv, {
			code,
			redirectUri,
			clientId: client.client_id,
			codeVerifier: verifier,
		});
		const accessToken = (tokenRes.body as TokenResponse).access_token;

		const list = await srv.get("/v1/tokens", { token: user.token });
		const items = (
			list.body as {
				result: {
					items: { id: string; managed?: boolean; description?: string }[];
				};
			}
		).result.items;
		const mine = items.find((t) => t.description === "MCP: lifecycle client");
		expect(mine).toBeDefined();
		expect(mine?.managed).toBe(true);

		// The token authenticates /mcp before revocation.
		const before = await srv.post("/mcp", {
			token: accessToken,
			body: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
		});
		expect(before.status).toBe(200);

		const del = await srv.delete(`/v1/tokens/${mine?.id}`, {
			token: user.token,
		});
		expect(del.status).toBe(200);

		const after = await srv.post("/mcp", {
			token: accessToken,
			body: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
		});
		expect(after.status).toBe(401);
	});
});

describe("oauth: token expiry regression (authenticateUser WHERE change)", () => {
	let srv: TestServer;
	let user: TestUser;
	let client: RegisteredClient;
	const redirectUri = "http://localhost:9999/cb";

	beforeAll(async () => {
		srv = await TestServer.start();
		user = await srv.register({
			email: `oauth-expiry-${crypto.randomUUID()}@example.com`,
		});
		client = await registerClient(srv, redirectUri, "expiry client");
	});
	afterAll(() => srv.stop());

	test("an OAuth-minted token stops working once its expires_at is in the past", async () => {
		const { verifier, challenge } = await generatePkcePair();
		const auth = await driveAuthorize(srv, user.token, {
			clientId: client.client_id,
			redirectUri,
			codeChallenge: challenge,
		});
		const code = codeFromLocation(auth.location);
		const tokenRes = await exchangeCode(srv, {
			code,
			redirectUri,
			clientId: client.client_id,
			codeVerifier: verifier,
		});
		const accessToken = (tokenRes.body as TokenResponse).access_token;

		// Sanity: works before we force-expire it.
		const before = await srv.get("/v1/projects", { token: accessToken });
		expect(before.status).toBe(200);

		srv.db.run(
			"UPDATE tokens SET expires_at = ?1 WHERE token_hash IN (SELECT token_hash FROM tokens WHERE user_id = ?2 ORDER BY created_at DESC LIMIT 1)",
			[Date.now() - 1000, user.user.id],
		);

		const afterRest = await srv.get("/v1/projects", { token: accessToken });
		expect(afterRest.status).toBe(401);

		const afterMcp = await srv.post("/mcp", {
			token: accessToken,
			body: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
		});
		expect(afterMcp.status).toBe(401);
	});

	test("a NULL-expiry token (created via POST /v1/tokens) keeps working - no regression for existing tokens", async () => {
		const created = await srv.post("/v1/tokens", {
			token: user.token,
			body: { description: "never expires" },
		});
		const rawToken = (created.body as { result: { token: string } }).result
			.token;

		const res = await srv.get("/v1/projects", { token: rawToken });
		expect(res.status).toBe(200);
	});
});
