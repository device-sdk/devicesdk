import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer } from "../harness";

function uniqueEmail(prefix = "user"): string {
	return `${prefix}-${crypto.randomUUID()}@example.com`;
}

// The register/login/cli rate limiters key on client IP, and their backing Map
// is process-global (shared across every TestServer instance for the whole
// run). Give each rate-limited request a unique forwarded IP so it lands in its
// own fixed-window bucket and never trips the limiter.
function freshIpHeaders(
	extra: Record<string, string> = {},
): Record<string, string> {
	return {
		"x-forwarded-for": `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}-${crypto.randomUUID()}`,
		...extra,
	};
}

function sessionCookie(headers: Headers): string {
	const raw = headers.get("set-cookie") ?? "";
	const m = raw.match(/devicesdk-session=([^;]+)/);
	if (!m) throw new Error(`no session cookie in: ${raw}`);
	return decodeURIComponent(m[1]);
}

/** Register via a fresh-IP request (avoids the global rate limiter). */
async function registerFresh(
	srv: TestServer,
	email: string,
	password = "password123",
	name?: string,
): Promise<string> {
	const res = await srv.post("/v1/auth/register", {
		headers: freshIpHeaders(),
		body: { email, password, name },
	});
	if (res.status !== 200)
		throw new Error(`register failed: ${res.status} ${res.text}`);
	return sessionCookie(res.headers);
}

describe("auth: registration / status (open registration)", () => {
	let srv: TestServer;

	beforeAll(async () => {
		srv = await TestServer.start();
	});
	afterAll(() => srv.stop());

	test("auth status before any user: no users, registration enabled", async () => {
		const res = await srv.get("/v1/auth/status");
		expect(res.status).toBe(200);
		const result = (
			res.body as {
				result: { has_users: boolean; registration_enabled: boolean };
			}
		).result;
		expect(result.has_users).toBe(false);
		expect(result.registration_enabled).toBe(true);
	});

	test("register first user returns sanitized user + session cookie", async () => {
		const email = uniqueEmail("first");
		const res = await srv.post("/v1/auth/register", {
			headers: freshIpHeaders(),
			body: { email, password: "password123", name: "First User" },
		});
		expect(res.status).toBe(200);
		const body = res.body as {
			success: boolean;
			result: { id: string; email: string; name: string };
		};
		expect(body.success).toBe(true);
		expect(body.result.email).toBe(email);
		expect(body.result.name).toBe("First User");
		// password_hash must never be leaked
		expect(
			(body.result as unknown as { password_hash?: string }).password_hash,
		).toBeUndefined();
		// session cookie issued
		expect(res.headers.get("set-cookie")).toContain("devicesdk-session=");
	});

	test("auth status after first user: has users, registration still enabled", async () => {
		const res = await srv.get("/v1/auth/status");
		const result = (
			res.body as {
				result: { has_users: boolean; registration_enabled: boolean };
			}
		).result;
		expect(result.has_users).toBe(true);
		expect(result.registration_enabled).toBe(true);
	});

	test("register defaults name to email local-part when name omitted", async () => {
		const local = `noname-${crypto.randomUUID().slice(0, 8)}`;
		const email = `${local}@example.com`;
		const res = await srv.post("/v1/auth/register", {
			headers: freshIpHeaders(),
			body: { email, password: "password123" },
		});
		expect(res.status).toBe(200);
		expect((res.body as { result: { name: string } }).result.name).toBe(local);
	});

	test("register lowercases the email", async () => {
		const upper = `MixedCase-${crypto.randomUUID().slice(0, 6)}@Example.COM`;
		const res = await srv.post("/v1/auth/register", {
			headers: freshIpHeaders(),
			body: { email: upper, password: "password123" },
		});
		expect(res.status).toBe(200);
		expect((res.body as { result: { email: string } }).result.email).toBe(
			upper.toLowerCase(),
		);
	});

	test("duplicate email returns 409", async () => {
		const email = uniqueEmail("dup");
		const first = await srv.post("/v1/auth/register", {
			headers: freshIpHeaders(),
			body: { email, password: "password123" },
		});
		expect(first.status).toBe(200);
		const second = await srv.post("/v1/auth/register", {
			headers: freshIpHeaders(),
			body: { email, password: "password123" },
		});
		expect(second.status).toBe(409);
		expect((second.body as { success: boolean }).success).toBe(false);
	});

	test("duplicate email is case-insensitive (collides via lowercasing)", async () => {
		const base = `casecollide-${crypto.randomUUID().slice(0, 6)}`;
		const r1 = await srv.post("/v1/auth/register", {
			headers: freshIpHeaders(),
			body: { email: `${base}@example.com`, password: "password123" },
		});
		expect(r1.status).toBe(200);
		const r2 = await srv.post("/v1/auth/register", {
			headers: freshIpHeaders(),
			body: {
				email: `${base.toUpperCase()}@EXAMPLE.com`,
				password: "password123",
			},
		});
		expect(r2.status).toBe(409);
	});

	test.each([
		["missing email", { password: "password123" }],
		["invalid email", { email: "not-an-email", password: "password123" }],
		["short password", { email: uniqueEmail("short"), password: "short" }],
		["missing password", { email: uniqueEmail("nopw") }],
		["empty body", {}],
	])("register validation: %s -> 400", async (_label, payload) => {
		const res = await srv.post("/v1/auth/register", {
			headers: freshIpHeaders(),
			body: payload,
		});
		expect(res.status).toBe(400);
		expect((res.body as { success: boolean }).success).toBe(false);
	});

	test("register with non-JSON body -> 400", async () => {
		const res = await srv.post("/v1/auth/register", {
			headers: freshIpHeaders(),
			rawBody: "this is not json",
		});
		expect(res.status).toBe(400);
	});
});

describe("auth: registration disabled", () => {
	let srv: TestServer;

	beforeAll(async () => {
		srv = await TestServer.start({ ALLOW_REGISTRATION: "false" });
	});
	afterAll(() => srv.stop());

	test("status with no users: registration_enabled true (first user always allowed)", async () => {
		const res = await srv.get("/v1/auth/status");
		const result = (
			res.body as {
				result: { has_users: boolean; registration_enabled: boolean };
			}
		).result;
		expect(result.has_users).toBe(false);
		// even with ALLOW_REGISTRATION=false, count===0 means enabled
		expect(result.registration_enabled).toBe(true);
	});

	test("first user can register even with registration disabled", async () => {
		const res = await srv.post("/v1/auth/register", {
			headers: freshIpHeaders(),
			body: { email: uniqueEmail("owner"), password: "password123" },
		});
		expect(res.status).toBe(200);
	});

	test("status after first user: registration now disabled", async () => {
		const res = await srv.get("/v1/auth/status");
		const result = (
			res.body as {
				result: { has_users: boolean; registration_enabled: boolean };
			}
		).result;
		expect(result.has_users).toBe(true);
		expect(result.registration_enabled).toBe(false);
	});

	test("second user is rejected with 403", async () => {
		const res = await srv.post("/v1/auth/register", {
			headers: freshIpHeaders(),
			body: { email: uniqueEmail("second"), password: "password123" },
		});
		expect(res.status).toBe(403);
		expect((res.body as { success: boolean }).success).toBe(false);
	});

	test("invalid payload still returns 400 (validated before the disabled check)", async () => {
		const res = await srv.post("/v1/auth/register", {
			headers: freshIpHeaders(),
			body: { email: "bad", password: "x" },
		});
		expect(res.status).toBe(400);
	});
});

describe("auth: login", () => {
	let srv: TestServer;
	const email = uniqueEmail("login");

	beforeAll(async () => {
		srv = await TestServer.start();
		await registerFresh(srv, email, "password123");
	});
	afterAll(() => srv.stop());

	test("login with correct credentials issues a session", async () => {
		const res = await srv.post("/v1/auth/login", {
			headers: freshIpHeaders(),
			body: { email, password: "password123" },
		});
		expect(res.status).toBe(200);
		expect((res.body as { success: boolean }).success).toBe(true);
		expect(res.headers.get("set-cookie")).toContain("devicesdk-session=");
		expect(
			(res.body as { result: { password_hash?: string } }).result.password_hash,
		).toBeUndefined();
	});

	test("login is case-insensitive on email", async () => {
		const res = await srv.post("/v1/auth/login", {
			headers: freshIpHeaders(),
			body: { email: email.toUpperCase(), password: "password123" },
		});
		expect(res.status).toBe(200);
	});

	test("login wrong password -> 401", async () => {
		const res = await srv.post("/v1/auth/login", {
			headers: freshIpHeaders(),
			body: { email, password: "wrong-password" },
		});
		expect(res.status).toBe(401);
		expect((res.body as { success: boolean }).success).toBe(false);
	});

	test("login non-existent user -> 401", async () => {
		const res = await srv.post("/v1/auth/login", {
			headers: freshIpHeaders(),
			body: { email: uniqueEmail("ghost"), password: "password123" },
		});
		expect(res.status).toBe(401);
	});

	test("login validation: empty body -> 400", async () => {
		const res = await srv.post("/v1/auth/login", {
			headers: freshIpHeaders(),
			body: {},
		});
		expect(res.status).toBe(400);
	});

	test("login validation: invalid email -> 400", async () => {
		const res = await srv.post("/v1/auth/login", {
			headers: freshIpHeaders(),
			body: { email: "nope", password: "password123" },
		});
		expect(res.status).toBe(400);
	});

	test("login non-JSON body -> 400", async () => {
		const res = await srv.post("/v1/auth/login", {
			headers: freshIpHeaders(),
			rawBody: "<<<",
		});
		expect(res.status).toBe(400);
	});
});

describe("auth middleware: authenticateUser", () => {
	let srv: TestServer;
	let token: string;

	beforeAll(async () => {
		srv = await TestServer.start();
		token = await registerFresh(srv, uniqueEmail("mw"));
	});
	afterAll(() => srv.stop());

	test("authed endpoint with a valid session token -> 200", async () => {
		const res = await srv.get("/v1/user/me", { token });
		expect(res.status).toBe(200);
		expect((res.body as { success: boolean }).success).toBe(true);
	});

	test("missing token -> 401 missing_credentials", async () => {
		const res = await srv.get("/v1/user/me");
		expect(res.status).toBe(401);
		expect((res.body as { code: string }).code).toBe("missing_credentials");
	});

	test("invalid bearer token -> 401 invalid_token", async () => {
		const res = await srv.get("/v1/user/me", {
			token: "totally-bogus-session-token",
		});
		expect(res.status).toBe(401);
		expect((res.body as { code: string }).code).toBe("invalid_token");
	});

	test("malformed Authorization header (non-bearer) -> 401 missing_credentials", async () => {
		// getToken returns null for a non-bearer scheme, so it falls through to
		// the missing-token branch.
		const res = await srv.get("/v1/user/me", {
			headers: { Authorization: "Basic abc123" },
		});
		expect(res.status).toBe(401);
		expect((res.body as { code: string }).code).toBe("missing_credentials");
	});

	test("session-cookie auth via Cookie header works", async () => {
		const res = await srv.get("/v1/user/me", {
			headers: { Cookie: `devicesdk-session=${token}` },
		});
		expect(res.status).toBe(200);
	});

	test("bogus dsdk_ CLI token -> 401 invalid_cli_token", async () => {
		const res = await srv.get("/v1/user/me", {
			token: "dsdk_deadbeefdeadbeefdeadbeefdeadbeef",
		});
		expect(res.status).toBe(401);
		expect((res.body as { code: string }).code).toBe("invalid_cli_token");
	});

	test("bogus dsdk_refresh_ token is NOT treated as a CLI access token -> invalid_token", async () => {
		// refresh-prefixed tokens skip the cli-token branch and fall to session/API
		// token lookup, which fails as invalid_token.
		const res = await srv.get("/v1/user/me", {
			token: "dsdk_refresh_deadbeefdeadbeefdeadbeefdeadbeef",
		});
		expect(res.status).toBe(401);
		expect((res.body as { code: string }).code).toBe("invalid_token");
	});
});

describe("auth: logout clears the session", () => {
	let srv: TestServer;

	beforeAll(async () => {
		srv = await TestServer.start();
	});
	afterAll(() => srv.stop());

	test("logout (cookie-based) deletes the session so the token stops working", async () => {
		const token = await registerFresh(srv, uniqueEmail("logout"));
		// sanity: token works first
		const before = await srv.get("/v1/user/me", { token });
		expect(before.status).toBe(200);

		// logout deletes the session only when the token arrives as a cookie
		const logout = await srv.post("/v1/auth/logout", {
			headers: { Cookie: `devicesdk-session=${token}` },
			token,
		});
		expect(logout.status).toBe(200);
		expect((logout.body as { success: boolean }).success).toBe(true);

		// session is now gone -> token rejected
		const after = await srv.get("/v1/user/me", { token });
		expect(after.status).toBe(401);
		expect((after.body as { code: string }).code).toBe("invalid_token");
	});

	test("logout requires auth -> 401 without any credentials", async () => {
		const res = await srv.post("/v1/auth/logout");
		expect(res.status).toBe(401);
	});
});

describe("auth: API token bearer path", () => {
	let srv: TestServer;
	let sessionToken: string;

	beforeAll(async () => {
		srv = await TestServer.start();
		sessionToken = await registerFresh(srv, uniqueEmail("apitok"));
	});
	afterAll(() => srv.stop());

	test("create an API token and use it as a bearer on an authed endpoint", async () => {
		const create = await srv.post("/v1/tokens", {
			token: sessionToken,
			body: { description: "ci test token" },
		});
		expect(create.status).toBe(201);
		const apiToken = (create.body as { result: { token: string } }).result
			.token;
		expect(apiToken).toBeTruthy();

		// use the raw API token as a bearer
		const res = await srv.get("/v1/user/me", { token: apiToken });
		expect(res.status).toBe(200);
		expect((res.body as { success: boolean }).success).toBe(true);
	});

	test("a random (non-dsdk) bogus bearer -> 401 invalid_token", async () => {
		const res = await srv.get("/v1/user/me", {
			token: "0123456789abcdef0123456789abcdef",
		});
		expect(res.status).toBe(401);
		expect((res.body as { code: string }).code).toBe("invalid_token");
	});
});
