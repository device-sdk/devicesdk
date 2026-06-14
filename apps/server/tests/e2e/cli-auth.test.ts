import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer } from "../harness";

// The register/login/cli rate limiters key on client IP and share a
// process-global window Map across every TestServer instance. Give each
// rate-limited request a unique forwarded IP so it never trips the limiter.
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

function csrfCookie(headers: Headers): string {
	const raw = headers.get("set-cookie") ?? "";
	const m = raw.match(/cli_csrf=([^;]+)/);
	if (!m) throw new Error(`no cli_csrf cookie in: ${raw}`);
	return decodeURIComponent(m[1]);
}

async function registerFresh(srv: TestServer, email: string): Promise<string> {
	const res = await srv.post("/v1/auth/register", {
		headers: freshIpHeaders(),
		body: { email, password: "password123" },
	});
	if (res.status !== 200)
		throw new Error(`register: ${res.status} ${res.text}`);
	return sessionCookie(res.headers);
}

function form(fields: Record<string, string>): string {
	return new URLSearchParams(fields).toString();
}

interface StartResult {
	device_code: string;
	user_code: string;
	verification_url: string;
	verification_url_complete: string;
	expires_in: number;
	interval: number;
}

async function startFlow(srv: TestServer): Promise<StartResult> {
	const res = await srv.post("/v1/cli/auth/start", {
		headers: freshIpHeaders(),
	});
	expect(res.status).toBe(200);
	return (res.body as { result: StartResult }).result;
}

/**
 * Drives the approval page: GET it (authenticated) to obtain a CSRF token +
 * cookie, then POST the approve/deny form with matching CSRF.
 */
async function approve(
	srv: TestServer,
	token: string,
	userCode: string,
	action: "approve" | "deny" = "approve",
): Promise<void> {
	const page = await srv.get("/cli/auth", {
		token,
		query: { code: userCode },
	});
	expect(page.status).toBe(200);
	const csrf = csrfCookie(page.headers);
	const post = await srv.post("/cli/auth", {
		token,
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Cookie: `cli_csrf=${csrf}`,
		},
		rawBody: form({ code: userCode, csrf_token: csrf, action }),
	});
	expect(post.status).toBe(200);
}

describe("cli-auth: start", () => {
	let srv: TestServer;
	beforeAll(async () => {
		srv = await TestServer.start();
	});
	afterAll(() => srv.stop());

	test("start returns device/user codes and poll interval", async () => {
		const r = await startFlow(srv);
		expect(r.device_code).toMatch(/^DSDK_DEVICE_[0-9a-f]{32}$/);
		expect(r.user_code).toMatch(/^[A-Z]{4}-\d{4}$/);
		expect(r.interval).toBe(5);
		expect(r.expires_in).toBe(900);
		expect(r.verification_url).toContain("/cli/auth");
		expect(r.verification_url_complete).toContain(`code=${r.user_code}`);
	});

	test("each start issues distinct codes", async () => {
		const a = await startFlow(srv);
		const b = await startFlow(srv);
		expect(a.device_code).not.toBe(b.device_code);
	});
});

describe("cli-auth: poll before/around approval", () => {
	let srv: TestServer;
	beforeAll(async () => {
		srv = await TestServer.start();
	});
	afterAll(() => srv.stop());

	test("poll before approval -> pending", async () => {
		const { device_code } = await startFlow(srv);
		const res = await srv.post("/v1/cli/auth/poll", {
			headers: freshIpHeaders(),
			body: { device_code },
		});
		expect(res.status).toBe(200);
		expect((res.body as { result: { status: string } }).result.status).toBe(
			"pending",
		);
	});

	test("poll without device_code -> 400 missing_device_code", async () => {
		const res = await srv.post("/v1/cli/auth/poll", {
			headers: freshIpHeaders(),
			body: {},
		});
		expect(res.status).toBe(400);
		expect((res.body as { error: string }).error).toBe("missing_device_code");
	});

	test("poll with unknown device_code -> 400 invalid_device_code", async () => {
		const res = await srv.post("/v1/cli/auth/poll", {
			headers: freshIpHeaders(),
			body: { device_code: "DSDK_DEVICE_nope" },
		});
		expect(res.status).toBe(400);
		expect((res.body as { error: string }).error).toBe("invalid_device_code");
	});
});

describe("cli-auth: approval page (auth gating)", () => {
	let srv: TestServer;
	let token: string;
	beforeAll(async () => {
		srv = await TestServer.start();
		token = await registerFresh(srv, `cli-${crypto.randomUUID()}@example.com`);
	});
	afterAll(() => srv.stop());

	test("GET /cli/auth unauthenticated redirects to login", async () => {
		const { user_code } = await startFlow(srv);
		const res = await srv.get("/cli/auth", { query: { code: user_code } });
		// cliAuthUser redirects (302) to the dashboard login when unauthenticated
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toContain("/login");
	});

	test("GET /cli/auth without code renders the code-entry page", async () => {
		const res = await srv.get("/cli/auth", { token });
		expect(res.status).toBe(200);
		expect(res.text).toContain("Enter the code");
	});

	test("GET /cli/auth with a valid code renders the approval page + CSRF cookie", async () => {
		const { user_code } = await startFlow(srv);
		const res = await srv.get("/cli/auth", {
			token,
			query: { code: user_code },
		});
		expect(res.status).toBe(200);
		expect(res.text).toContain("Verification Code");
		expect(res.text).toContain(user_code);
		expect(res.headers.get("set-cookie")).toContain("cli_csrf=");
	});

	test("GET /cli/auth with an unknown code renders an error page", async () => {
		const res = await srv.get("/cli/auth", {
			token,
			query: { code: "ZZZZ-9999" },
		});
		expect(res.status).toBe(200);
		expect(res.text).toContain("Invalid or expired code");
	});

	test("POST /cli/auth with mismatched CSRF -> 403", async () => {
		const { user_code } = await startFlow(srv);
		// fetch page to set a real cookie, then post a wrong csrf_token
		const page = await srv.get("/cli/auth", {
			token,
			query: { code: user_code },
		});
		const csrf = csrfCookie(page.headers);
		const res = await srv.post("/cli/auth", {
			token,
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Cookie: `cli_csrf=${csrf}`,
			},
			rawBody: form({
				code: user_code,
				csrf_token: "wrong",
				action: "approve",
			}),
		});
		expect(res.status).toBe(403);
		expect(res.text).toContain("Invalid request");
	});

	test("POST /cli/auth with no CSRF cookie -> 403", async () => {
		const { user_code } = await startFlow(srv);
		const res = await srv.post("/cli/auth", {
			token,
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			rawBody: form({ code: user_code, csrf_token: "abc", action: "approve" }),
		});
		expect(res.status).toBe(403);
	});

	test("POST /cli/auth unauthenticated redirects to login", async () => {
		const { user_code } = await startFlow(srv);
		const res = await srv.post("/cli/auth", {
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			rawBody: form({ code: user_code, csrf_token: "x", action: "approve" }),
		});
		expect(res.status).toBe(302);
	});
});

describe("cli-auth: full approve -> poll -> use -> refresh -> revoke", () => {
	let srv: TestServer;
	let token: string;
	beforeAll(async () => {
		srv = await TestServer.start();
		token = await registerFresh(srv, `flow-${crypto.randomUUID()}@example.com`);
	});
	afterAll(() => srv.stop());

	test("approved poll yields tokens; access token authenticates; refresh + revoke", async () => {
		const { device_code, user_code } = await startFlow(srv);

		await approve(srv, token, user_code);

		// poll now returns the access + refresh tokens
		const poll = await srv.post("/v1/cli/auth/poll", {
			headers: freshIpHeaders(),
			body: { device_code },
		});
		expect(poll.status).toBe(200);
		const result = (
			poll.body as {
				result: {
					status: string;
					access_token: string;
					refresh_token: string;
					token_type: string;
					user: { email: string } | null;
				};
			}
		).result;
		expect(result.status).toBe("approved");
		expect(result.token_type).toBe("Bearer");
		expect(result.access_token).toMatch(/^dsdk_[0-9a-f]{64}$/);
		expect(result.refresh_token).toMatch(/^dsdk_refresh_[0-9a-f]{64}$/);
		expect(result.user?.email).toBeTruthy();

		const accessToken = result.access_token;
		const refreshToken = result.refresh_token;

		// the dsdk_ access token authenticates a real API call
		const me = await srv.get("/v1/user/me", { token: accessToken });
		expect(me.status).toBe(200);
		expect((me.body as { success: boolean }).success).toBe(true);

		// polling the same device_code again -> the code row was consumed (deleted)
		const pollAgain = await srv.post("/v1/cli/auth/poll", {
			headers: freshIpHeaders(),
			body: { device_code },
		});
		expect(pollAgain.status).toBe(400);
		expect((pollAgain.body as { error: string }).error).toBe(
			"invalid_device_code",
		);

		// refresh issues a brand-new access + refresh token
		const refresh = await srv.post("/v1/cli/auth/refresh", {
			headers: freshIpHeaders(),
			body: { refresh_token: refreshToken },
		});
		expect(refresh.status).toBe(200);
		const refreshed = (
			refresh.body as {
				result: { access_token: string; refresh_token: string };
			}
		).result;
		expect(refreshed.access_token).toMatch(/^dsdk_[0-9a-f]{64}$/);
		expect(refreshed.access_token).not.toBe(accessToken);
		expect(refreshed.refresh_token).not.toBe(refreshToken);

		// the new access token works
		const me2 = await srv.get("/v1/user/me", { token: refreshed.access_token });
		expect(me2.status).toBe(200);

		// the OLD refresh token was rotated out -> now invalid
		const staleRefresh = await srv.post("/v1/cli/auth/refresh", {
			headers: freshIpHeaders(),
			body: { refresh_token: refreshToken },
		});
		expect(staleRefresh.status).toBe(401);
		expect((staleRefresh.body as { error: string }).error).toBe(
			"invalid_refresh_token",
		);

		// revoke the current refresh token (auth required)
		const revoke = await srv.post("/v1/cli/auth/revoke", {
			token,
			body: { refresh_token: refreshed.refresh_token },
		});
		expect(revoke.status).toBe(200);
		expect(
			(revoke.body as { result: { revoked: boolean } }).result.revoked,
		).toBe(true);

		// after revoke, the rotated refresh token is gone
		const afterRevoke = await srv.post("/v1/cli/auth/refresh", {
			headers: freshIpHeaders(),
			body: { refresh_token: refreshed.refresh_token },
		});
		expect(afterRevoke.status).toBe(401);
	});

	test("denied flow: poll returns denied and consumes the code", async () => {
		const { device_code, user_code } = await startFlow(srv);
		await approve(srv, token, user_code, "deny");

		const poll = await srv.post("/v1/cli/auth/poll", {
			headers: freshIpHeaders(),
			body: { device_code },
		});
		expect(poll.status).toBe(200);
		expect((poll.body as { result: { status: string } }).result.status).toBe(
			"denied",
		);

		// denied code is deleted after the poll
		const again = await srv.post("/v1/cli/auth/poll", {
			headers: freshIpHeaders(),
			body: { device_code },
		});
		expect(again.status).toBe(400);
		expect((again.body as { error: string }).error).toBe("invalid_device_code");
	});
});

describe("cli-auth: refresh / revoke error branches", () => {
	let srv: TestServer;
	let token: string;
	beforeAll(async () => {
		srv = await TestServer.start();
		token = await registerFresh(srv, `err-${crypto.randomUUID()}@example.com`);
	});
	afterAll(() => srv.stop());

	test("refresh without a token -> 400 missing_refresh_token", async () => {
		const res = await srv.post("/v1/cli/auth/refresh", {
			headers: freshIpHeaders(),
			body: {},
		});
		expect(res.status).toBe(400);
		expect((res.body as { error: string }).error).toBe("missing_refresh_token");
	});

	test("refresh with an unknown token -> 401 invalid_refresh_token", async () => {
		const res = await srv.post("/v1/cli/auth/refresh", {
			headers: freshIpHeaders(),
			body: { refresh_token: "dsdk_refresh_deadbeef" },
		});
		expect(res.status).toBe(401);
		expect((res.body as { error: string }).error).toBe("invalid_refresh_token");
	});

	test("revoke requires auth -> 401 without credentials", async () => {
		const res = await srv.post("/v1/cli/auth/revoke", {
			body: { refresh_token: "dsdk_refresh_whatever" },
		});
		expect(res.status).toBe(401);
	});

	test("revoke with no refresh_token is a no-op success", async () => {
		const res = await srv.post("/v1/cli/auth/revoke", { token, body: {} });
		expect(res.status).toBe(200);
		expect((res.body as { result: { revoked: boolean } }).result.revoked).toBe(
			true,
		);
	});

	test("revoke an unknown token still succeeds (idempotent)", async () => {
		const res = await srv.post("/v1/cli/auth/revoke", {
			token,
			body: { refresh_token: "dsdk_refresh_unknown" },
		});
		expect(res.status).toBe(200);
	});
});

describe("cli-auth: expired code handling", () => {
	let srv: TestServer;
	beforeAll(async () => {
		srv = await TestServer.start();
	});
	afterAll(() => srv.stop());

	test("polling an expired code -> 400 authorization_expired and the row is purged", async () => {
		const { device_code, user_code } = await startFlow(srv);
		// force-expire the code directly in the test DB
		srv.db.run(
			"UPDATE cli_auth_codes SET expires_at = ? WHERE device_code = ?",
			[Date.now() - 1000, device_code],
		);

		const poll = await srv.post("/v1/cli/auth/poll", {
			headers: freshIpHeaders(),
			body: { device_code },
		});
		expect(poll.status).toBe(400);
		expect((poll.body as { error: string }).error).toBe(
			"authorization_expired",
		);

		// the expired row was deleted, so the approval page now errors on it
		const remaining = srv.db
			.query("SELECT COUNT(*) AS n FROM cli_auth_codes WHERE user_code = ?")
			.get(user_code) as { n: number };
		expect(remaining.n).toBe(0);
	});
});
