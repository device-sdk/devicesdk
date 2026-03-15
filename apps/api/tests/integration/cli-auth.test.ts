import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";
import { D1QB } from "workers-qb";
import { hashToken } from "../../src/endpoints/cli-auth/utils";
import type { tableUser } from "../../src/types";

describe.sequential("CLI Authentication", () => {
	let qb: D1QB;

	beforeEach(async () => {
		qb = new D1QB(env.DB);
		// Clean up test data
		await env.DB.prepare("DELETE FROM cli_auth_codes").run();
		await env.DB.prepare("DELETE FROM cli_tokens").run();
	});

	describe("POST /v1/cli/auth/start", () => {
		test("should return device_code and user_code", async () => {
			const res = await SELF.fetch("http://localhost/v1/cli/auth/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ client_id: "devicesdk-cli" }),
			});

			expect(res.status).toBe(200);
			const body = await res.json();

			expect(body.success).toBe(true);
			expect(body.result.device_code).toMatch(/^DSDK_DEVICE_[a-f0-9]{32}$/);
			expect(body.result.user_code).toMatch(/^[A-Z]{4}-[0-9]{4}$/);
			expect(body.result.verification_url).toContain("/cli/auth");
			expect(body.result.verification_url_complete).toContain(
				body.result.user_code,
			);
			expect(body.result.expires_in).toBe(900);
			expect(body.result.interval).toBe(5);
		});

		test("should store auth code in database", async () => {
			const res = await SELF.fetch("http://localhost/v1/cli/auth/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ client_id: "devicesdk-cli" }),
			});

			const body = await res.json();
			const authCode = await env.DB.prepare(
				"SELECT * FROM cli_auth_codes WHERE device_code = ?",
			)
				.bind(body.result.device_code)
				.first();

			expect(authCode).not.toBeNull();
			expect(authCode?.status).toBe("pending");
			expect(authCode?.user_code).toBe(body.result.user_code);
		});
	});

	describe("POST /v1/cli/auth/poll", () => {
		test("should return pending status for unapproved code", async () => {
			// Start auth flow
			const startRes = await SELF.fetch("http://localhost/v1/cli/auth/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ client_id: "devicesdk-cli" }),
			});
			const startBody = await startRes.json();

			// Poll
			const pollRes = await SELF.fetch("http://localhost/v1/cli/auth/poll", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ device_code: startBody.result.device_code }),
			});

			expect(pollRes.status).toBe(200);
			const pollBody = await pollRes.json();
			expect(pollBody.success).toBe(true);
			expect(pollBody.result.status).toBe("pending");
		});

		test("should return error for invalid device_code", async () => {
			const res = await SELF.fetch("http://localhost/v1/cli/auth/poll", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ device_code: "invalid_code" }),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.error).toBe("invalid_device_code");
		});

		test("should return error for missing device_code", async () => {
			const res = await SELF.fetch("http://localhost/v1/cli/auth/poll", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.error).toBe("missing_device_code");
		});

		test("should return error for expired code", async () => {
			// Insert expired auth code
			const deviceCode = `DSDK_DEVICE_${"a".repeat(32)}`;
			await env.DB.prepare(
				`INSERT INTO cli_auth_codes (id, device_code, user_code, status, created_at, expires_at)
				 VALUES (?, ?, ?, 'pending', ?, ?)`,
			)
				.bind(
					crypto.randomUUID(),
					deviceCode,
					"TEST-1234",
					Date.now() - 1000000,
					Date.now() - 1000,
				)
				.run();

			const res = await SELF.fetch("http://localhost/v1/cli/auth/poll", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ device_code: deviceCode }),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.error).toBe("authorization_expired");
		});

		test("should return denied status when user denies", async () => {
			// Insert denied auth code
			const deviceCode = `DSDK_DEVICE_${"b".repeat(32)}`;
			await env.DB.prepare(
				`INSERT INTO cli_auth_codes (id, device_code, user_code, status, created_at, expires_at)
				 VALUES (?, ?, ?, 'denied', ?, ?)`,
			)
				.bind(
					crypto.randomUUID(),
					deviceCode,
					"DENY-1234",
					Date.now(),
					Date.now() + 900000,
				)
				.run();

			const res = await SELF.fetch("http://localhost/v1/cli/auth/poll", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ device_code: deviceCode }),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.result.status).toBe("denied");
		});

		test("should return tokens when user approves", async () => {
			// Create a test user
			const userId = crypto.randomUUID();
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: userId,
						name: "Test CLI User",
						email: "cli-test@devicesdk.com",
						created_at: Date.now(),
						verified_email: 1,
						picture: "",
					},
				})
				.execute();

			// Insert approved auth code
			const deviceCode = `DSDK_DEVICE_${"c".repeat(32)}`;
			await env.DB.prepare(
				`INSERT INTO cli_auth_codes (id, device_code, user_code, user_id, status, created_at, expires_at)
				 VALUES (?, ?, ?, ?, 'approved', ?, ?)`,
			)
				.bind(
					crypto.randomUUID(),
					deviceCode,
					"APRV-1234",
					userId,
					Date.now(),
					Date.now() + 900000,
				)
				.run();

			const res = await SELF.fetch("http://localhost/v1/cli/auth/poll", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ device_code: deviceCode }),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.result.status).toBe("approved");
			expect(body.result.access_token).toMatch(/^dsdk_[a-f0-9]{32}$/);
			expect(body.result.refresh_token).toMatch(/^dsdk_refresh_[a-f0-9]{32}$/);
			expect(body.result.expires_in).toBe(86400);
			expect(body.result.token_type).toBe("Bearer");
			expect(body.result.user.id).toBe(userId);
			expect(body.result.user.email).toBe("cli-test@devicesdk.com");

			// Verify auth code is deleted
			const authCode = await env.DB.prepare(
				"SELECT * FROM cli_auth_codes WHERE device_code = ?",
			)
				.bind(deviceCode)
				.first();
			expect(authCode).toBeNull();

			// Verify token is stored
			const tokenRecord = await env.DB.prepare(
				"SELECT * FROM cli_tokens WHERE user_id = ?",
			)
				.bind(userId)
				.first();
			expect(tokenRecord).not.toBeNull();
		});
	});

	describe("POST /v1/cli/auth/refresh", () => {
		test("should return new tokens for valid refresh token", async () => {
			// Create a test user
			const userId = crypto.randomUUID();
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: userId,
						name: "Refresh Test User",
						email: "refresh-test@devicesdk.com",
						created_at: Date.now(),
						verified_email: 1,
						picture: "",
					},
				})
				.execute();

			// Create a token record
			const refreshToken = `dsdk_refresh_${"d".repeat(32)}`;
			const accessToken = `dsdk_${"e".repeat(32)}`;
			await env.DB.prepare(
				`INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at)
				 VALUES (?, ?, ?, ?, ?, ?)`,
			)
				.bind(
					crypto.randomUUID(),
					userId,
					await hashToken(accessToken),
					await hashToken(refreshToken),
					Date.now(),
					Date.now() + 30 * 24 * 60 * 60 * 1000,
				)
				.run();

			const res = await SELF.fetch("http://localhost/v1/cli/auth/refresh", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ refresh_token: refreshToken }),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.result.access_token).toMatch(/^dsdk_[a-f0-9]{32}$/);
			expect(body.result.refresh_token).toMatch(/^dsdk_refresh_[a-f0-9]{32}$/);
			expect(body.result.expires_in).toBe(86400);
			expect(body.result.token_type).toBe("Bearer");

			// Old token should be deleted
			const oldToken = await env.DB.prepare(
				"SELECT * FROM cli_tokens WHERE refresh_token_hash = ?",
			)
				.bind(await hashToken(refreshToken))
				.first();
			expect(oldToken).toBeNull();
		});

		test("should return error for invalid refresh token", async () => {
			const res = await SELF.fetch("http://localhost/v1/cli/auth/refresh", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ refresh_token: "invalid_token" }),
			});

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.error).toBe("invalid_refresh_token");
		});

		test("should return error for missing refresh token", async () => {
			const res = await SELF.fetch("http://localhost/v1/cli/auth/refresh", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.error).toBe("missing_refresh_token");
		});

		test("should return error for expired refresh token", async () => {
			// Create a test user
			const userId = crypto.randomUUID();
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: userId,
						name: "Expired Refresh User",
						email: "expired-refresh@devicesdk.com",
						created_at: Date.now(),
						verified_email: 1,
						picture: "",
					},
				})
				.execute();

			// Create an expired token record
			const refreshToken = `dsdk_refresh_${"f".repeat(32)}`;
			const accessToken = `dsdk_${"g".repeat(32)}`;
			await env.DB.prepare(
				`INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at)
				 VALUES (?, ?, ?, ?, ?, ?)`,
			)
				.bind(
					crypto.randomUUID(),
					userId,
					await hashToken(accessToken),
					await hashToken(refreshToken),
					Date.now() - 1000000,
					Date.now() - 1000,
				)
				.run();

			const res = await SELF.fetch("http://localhost/v1/cli/auth/refresh", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ refresh_token: refreshToken }),
			});

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.error).toBe("invalid_refresh_token");
		});
	});

	describe("POST /v1/cli/auth/revoke", () => {
		test("should revoke token successfully", async () => {
			// Create a test user and session for auth
			const userId = crypto.randomUUID();
			const sessionToken = "revoke-session-token";
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: userId,
						name: "Revoke Test User",
						email: "revoke-test@devicesdk.com",
						created_at: Date.now(),
						verified_email: 1,
						picture: "",
					},
				})
				.execute();

			await qb
				.insert({
					tableName: "user_sessions",
					data: {
						user_id: userId,
						token: sessionToken,
						created_at: Date.now(),
						expires_at: Date.now() + 100000,
					},
				})
				.execute();

			// Create a CLI token to revoke
			const refreshToken = `dsdk_refresh_${"h".repeat(32)}`;
			const accessToken = `dsdk_${"i".repeat(32)}`;
			await env.DB.prepare(
				`INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at)
				 VALUES (?, ?, ?, ?, ?, ?)`,
			)
				.bind(
					crypto.randomUUID(),
					userId,
					await hashToken(accessToken),
					await hashToken(refreshToken),
					Date.now(),
					Date.now() + 30 * 24 * 60 * 60 * 1000,
				)
				.run();

			const res = await SELF.fetch("http://localhost/v1/cli/auth/revoke", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
				},
				body: JSON.stringify({ refresh_token: refreshToken }),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.result.revoked).toBe(true);

			// Verify token is deleted
			const tokenRecord = await env.DB.prepare(
				"SELECT * FROM cli_tokens WHERE refresh_token_hash = ?",
			)
				.bind(await hashToken(refreshToken))
				.first();
			expect(tokenRecord).toBeNull();
		});

		test("should succeed even if token doesn't exist", async () => {
			// Create a test user and session for auth
			const userId = crypto.randomUUID();
			const sessionToken = "revoke-session-token-2";
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: userId,
						name: "Revoke Test User 2",
						email: "revoke-test-2@devicesdk.com",
						created_at: Date.now(),
						verified_email: 1,
						picture: "",
					},
				})
				.execute();

			await qb
				.insert({
					tableName: "user_sessions",
					data: {
						user_id: userId,
						token: sessionToken,
						created_at: Date.now(),
						expires_at: Date.now() + 100000,
					},
				})
				.execute();

			const res = await SELF.fetch("http://localhost/v1/cli/auth/revoke", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
				},
				body: JSON.stringify({ refresh_token: "nonexistent_token" }),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.result.revoked).toBe(true);
		});
	});

	describe("CLI Token Authentication", () => {
		test("should authenticate requests with valid CLI access token", async () => {
			// Create a test user
			const userId = crypto.randomUUID();
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: userId,
						name: "CLI Auth Test User",
						email: "cli-auth-test@devicesdk.com",
						created_at: Date.now(),
						verified_email: 1,
						picture: "",
					},
				})
				.execute();

			// Create a CLI token
			const accessToken = `dsdk_${"j".repeat(32)}`;
			const refreshToken = `dsdk_refresh_${"k".repeat(32)}`;
			await env.DB.prepare(
				`INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at)
				 VALUES (?, ?, ?, ?, ?, ?)`,
			)
				.bind(
					crypto.randomUUID(),
					userId,
					await hashToken(accessToken),
					await hashToken(refreshToken),
					Date.now(),
					Date.now() + 86400000,
				)
				.run();

			// Make authenticated request
			const res = await SELF.fetch("http://localhost/v1/user/me", {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.result.id).toBe(userId);
			expect(body.result.email).toBe("cli-auth-test@devicesdk.com");
		});

		test("should reject requests with invalid CLI access token", async () => {
			const res = await SELF.fetch("http://localhost/v1/user/me", {
				headers: {
					Authorization: "Bearer dsdk_invalid_token_12345678901234",
				},
			});

			expect(res.status).toBe(401);
		});

		test("should reject requests with expired CLI access token", async () => {
			// Create a test user
			const userId = crypto.randomUUID();
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: userId,
						name: "Expired CLI User",
						email: "expired-cli@devicesdk.com",
						created_at: Date.now(),
						verified_email: 1,
						picture: "",
					},
				})
				.execute();

			// Create an expired CLI token
			const accessToken = `dsdk_${"l".repeat(32)}`;
			const refreshToken = `dsdk_refresh_${"m".repeat(32)}`;
			await env.DB.prepare(
				`INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at)
				 VALUES (?, ?, ?, ?, ?, ?)`,
			)
				.bind(
					crypto.randomUUID(),
					userId,
					await hashToken(accessToken),
					await hashToken(refreshToken),
					Date.now() - 1000000,
					Date.now() - 1000,
				)
				.run();

			const res = await SELF.fetch("http://localhost/v1/user/me", {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			expect(res.status).toBe(401);
		});
	});

	describe("GET /cli/auth (Approval Page)", () => {
		test("should redirect to dashboard login when not authenticated", async () => {
			const res = await SELF.fetch("http://localhost/cli/auth", {
				redirect: "manual",
			});

			expect(res.status).toBe(302);
			const location = res.headers.get("location");
			expect(location).toContain("https://dash.devicesdk.com/login");
			expect(location).toContain("redirect_uri=");
		});

		test("should render code entry page when authenticated and no code provided", async () => {
			// Create a test user and session
			const userId = crypto.randomUUID();
			const sessionToken = "approval-page-session";
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: userId,
						name: "Approval Page Test User",
						email: "approval-page-test@devicesdk.com",
						created_at: Date.now(),
						verified_email: 1,
						picture: "",
					},
				})
				.execute();

			await qb
				.insert({
					tableName: "user_sessions",
					data: {
						user_id: userId,
						token: sessionToken,
						created_at: Date.now(),
						expires_at: Date.now() + 100000,
					},
				})
				.execute();

			const res = await SELF.fetch("http://localhost/cli/auth", {
				headers: {
					Cookie: `devicesdk-session=${sessionToken}`,
				},
			});

			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain("Enter the code shown in your terminal");
			expect(html).toContain('name="code"');
		});

		test("should render error page for invalid code when authenticated", async () => {
			// Create a test user and session
			const userId = crypto.randomUUID();
			const sessionToken = "invalid-code-session";
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: userId,
						name: "Invalid Code Test User",
						email: "invalid-code-test@devicesdk.com",
						created_at: Date.now(),
						verified_email: 1,
						picture: "",
					},
				})
				.execute();

			await qb
				.insert({
					tableName: "user_sessions",
					data: {
						user_id: userId,
						token: sessionToken,
						created_at: Date.now(),
						expires_at: Date.now() + 100000,
					},
				})
				.execute();

			const res = await SELF.fetch(
				"http://localhost/cli/auth?code=INVALID-0000",
				{
					headers: {
						Cookie: `devicesdk-session=${sessionToken}`,
					},
				},
			);

			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain("Invalid or expired code");
		});

		test("should render approval page for valid code when authenticated", async () => {
			// Create a test user and session
			const userId = crypto.randomUUID();
			const sessionToken = "valid-code-session";
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: userId,
						name: "Valid Code Test User",
						email: "valid-code-test@devicesdk.com",
						created_at: Date.now(),
						verified_email: 1,
						picture: "",
					},
				})
				.execute();

			await qb
				.insert({
					tableName: "user_sessions",
					data: {
						user_id: userId,
						token: sessionToken,
						created_at: Date.now(),
						expires_at: Date.now() + 100000,
					},
				})
				.execute();

			// Insert a valid auth code
			const userCode = "VALC-1234";
			await env.DB.prepare(
				`INSERT INTO cli_auth_codes (id, device_code, user_code, status, created_at, expires_at)
				 VALUES (?, ?, ?, 'pending', ?, ?)`,
			)
				.bind(
					crypto.randomUUID(),
					`DSDK_DEVICE_${"n".repeat(32)}`,
					userCode,
					Date.now(),
					Date.now() + 900000,
				)
				.run();

			const res = await SELF.fetch(
				`http://localhost/cli/auth?code=${userCode}`,
				{
					headers: {
						Cookie: `devicesdk-session=${sessionToken}`,
					},
				},
			);

			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain("A CLI tool is requesting access");
			expect(html).toContain(userCode);
			expect(html).toContain("Approve");
			expect(html).toContain("Deny");
		});
	});

	describe("POST /cli/auth (Handle Approval)", () => {
		test("should redirect to dashboard login when not authenticated", async () => {
			const res = await SELF.fetch("http://localhost/cli/auth", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: "code=TEST-1234&action=approve",
				redirect: "manual",
			});

			expect(res.status).toBe(302);
			const location = res.headers.get("location");
			expect(location).toContain("https://dash.devicesdk.com/login");
			expect(location).toContain("redirect_uri=");
		});

		test("should approve auth code when user approves", async () => {
			// Create a test user and session
			const userId = crypto.randomUUID();
			const sessionToken = "approval-session-token";
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: userId,
						name: "Approval Test User",
						email: "approval-test@devicesdk.com",
						created_at: Date.now(),
						verified_email: 1,
						picture: "",
					},
				})
				.execute();

			await qb
				.insert({
					tableName: "user_sessions",
					data: {
						user_id: userId,
						token: sessionToken,
						created_at: Date.now(),
						expires_at: Date.now() + 100000,
					},
				})
				.execute();

			// Insert auth code
			const userCode = "APRV-5678";
			const authCodeId = crypto.randomUUID();
			await env.DB.prepare(
				`INSERT INTO cli_auth_codes (id, device_code, user_code, status, created_at, expires_at)
				 VALUES (?, ?, ?, 'pending', ?, ?)`,
			)
				.bind(
					authCodeId,
					`DSDK_DEVICE_${"o".repeat(32)}`,
					userCode,
					Date.now(),
					Date.now() + 900000,
				)
				.run();

			const res = await SELF.fetch("http://localhost/cli/auth", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Cookie: `devicesdk-session=${sessionToken}`,
				},
				body: `code=${userCode}&action=approve`,
			});

			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain("CLI login approved");

			// Verify auth code is updated
			const authCode = await env.DB.prepare(
				"SELECT * FROM cli_auth_codes WHERE id = ?",
			)
				.bind(authCodeId)
				.first();
			expect(authCode?.status).toBe("approved");
			expect(authCode?.user_id).toBe(userId);
		});

		test("should deny auth code when user denies", async () => {
			// Create a test user and session
			const userId = crypto.randomUUID();
			const sessionToken = "deny-session-token";
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: userId,
						name: "Deny Test User",
						email: "deny-test@devicesdk.com",
						created_at: Date.now(),
						verified_email: 1,
						picture: "",
					},
				})
				.execute();

			await qb
				.insert({
					tableName: "user_sessions",
					data: {
						user_id: userId,
						token: sessionToken,
						created_at: Date.now(),
						expires_at: Date.now() + 100000,
					},
				})
				.execute();

			// Insert auth code
			const userCode = "DENY-5678";
			const authCodeId = crypto.randomUUID();
			await env.DB.prepare(
				`INSERT INTO cli_auth_codes (id, device_code, user_code, status, created_at, expires_at)
				 VALUES (?, ?, ?, 'pending', ?, ?)`,
			)
				.bind(
					authCodeId,
					`DSDK_DEVICE_${"p".repeat(32)}`,
					userCode,
					Date.now(),
					Date.now() + 900000,
				)
				.run();

			const res = await SELF.fetch("http://localhost/cli/auth", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Cookie: `devicesdk-session=${sessionToken}`,
				},
				body: `code=${userCode}&action=deny`,
			});

			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain("CLI login denied");

			// Verify auth code is updated
			const authCode = await env.DB.prepare(
				"SELECT * FROM cli_auth_codes WHERE id = ?",
			)
				.bind(authCodeId)
				.first();
			expect(authCode?.status).toBe("denied");
			expect(authCode?.user_id).toBeNull();
		});
	});

	describe("Full CLI Auth Flow", () => {
		test(
			"complete flow: start -> approve -> poll -> authenticate",
			{ timeout: 15000 },
			async () => {
				// Create a test user and session for browser approval
				const userId = crypto.randomUUID();
				const sessionToken = "full-flow-session";
				await qb
					.insert<tableUser>({
						tableName: "user",
						data: {
							id: userId,
							name: "Full Flow User",
							email: "full-flow@devicesdk.com",
							created_at: Date.now(),
							verified_email: 1,
							picture: "",
						},
					})
					.execute();

				await qb
					.insert({
						tableName: "user_sessions",
						data: {
							user_id: userId,
							token: sessionToken,
							created_at: Date.now(),
							expires_at: Date.now() + 100000,
						},
					})
					.execute();

				// Step 1: CLI starts auth flow
				const startRes = await SELF.fetch(
					"http://localhost/v1/cli/auth/start",
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ client_id: "devicesdk-cli" }),
					},
				);
				const startBody = await startRes.json();
				expect(startBody.success).toBe(true);
				const { device_code, user_code } = startBody.result;

				// Step 2: User approves in browser
				const approveRes = await SELF.fetch("http://localhost/cli/auth", {
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Cookie: `devicesdk-session=${sessionToken}`,
					},
					body: `code=${user_code}&action=approve`,
				});
				expect(approveRes.status).toBe(200);

				// Step 3: CLI polls and gets tokens
				const pollRes = await SELF.fetch("http://localhost/v1/cli/auth/poll", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ device_code }),
				});
				const pollBody = await pollRes.json();
				expect(pollBody.success).toBe(true);
				expect(pollBody.result.status).toBe("approved");
				expect(pollBody.result.access_token).toBeDefined();
				expect(pollBody.result.user.email).toBe("full-flow@devicesdk.com");

				// Step 4: CLI uses token to make authenticated request
				const authRes = await SELF.fetch("http://localhost/v1/user/me", {
					headers: {
						Authorization: `Bearer ${pollBody.result.access_token}`,
					},
				});
				const authBody = await authRes.json();
				expect(authRes.status).toBe(200);
				expect(authBody.result.id).toBe(userId);
			},
		);
	});
});
