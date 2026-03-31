import { env, SELF } from "cloudflare:test";
import { ApiException } from "chanfana";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { beforeEach, describe, expect, it, test, vi } from "vitest";
import { D1QB } from "workers-qb";
import { handleGoogleCallback, hashPassword } from "../../src/foundation/auth";
import type { AppContext, tableUser, tableUserSessions } from "../../src/types";
import {
	TEST_SUSPENDED_SESSION_TOKEN,
	TEST_SUSPENDED_USER_ID,
	TEST_USER_ID,
} from "../setup-test-data";

describe.sequential("Authentication", () => {
	let qb: D1QB;

	beforeEach(async () => {
		vi.clearAllMocks();
		qb = new D1QB(env.DB);
	});

	describe("authenticateUser middleware", () => {
		test("should return 401 if no token is provided", async () => {
			const res = await SELF.fetch("http://localhost/v1/user/me");
			expect(res.status).toBe(401);
		});

		test("should return 401 if token is invalid", async () => {
			const res = await SELF.fetch("http://localhost/v1/user/me", {
				headers: {
					Authorization: "Bearer invalid-token",
				},
			});
			expect(res.status).toBe(401);
		});

		test("should return 401 if cookie is invalid", async () => {
			const res = await SELF.fetch("http://localhost/v1/user/me", {
				headers: {
					Cookie: "devicesdk-session=invalid-cookie",
				},
			});
			expect(res.status).toBe(401);
		});

		test("should return 401 if authorization scheme is not Bearer", async () => {
			const res = await SELF.fetch("http://localhost/v1/user/me", {
				headers: {
					Authorization: "Basic invalid-token",
				},
			});
			expect(res.status).toBe(401);
		});

		test("should return 401 if token is expired", async () => {
			const token = await hashPassword("expired-token", env.SALT_TOKEN);
			const user = {
				id: "1",
				name: "test-user",
				email: "test-user@devicesdk.com",
				created_at: Date.now(),
				verified_email: 1,
				picture: "",
			};
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: user,
				})
				.execute();
			await qb
				.insert<tableUserSessions>({
					tableName: "user_sessions",
					data: {
						token,
						user_id: user.id,
						created_at: Date.now(),
						expires_at: Date.now() - 1000,
					},
				})
				.execute();

			const res = await SELF.fetch("http://localhost/v1/user/me", {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});
			expect(res.status).toBe(401);
		});

		test("should call next middleware if token is valid in cookie", async () => {
			const token = "valid-token-1";
			const user = {
				id: "3",
				name: "test-user-3",
				email: "test-user-3@devicesdk.com",
				created_at: Date.now(),
				verified_email: 1,
				picture: "",
			};
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: user,
				})
				.execute();
			await qb
				.insert<tableUserSessions>({
					tableName: "user_sessions",
					data: {
						token,
						user_id: user.id,
						created_at: Date.now(),
						expires_at: Date.now() + 100000,
					},
				})
				.execute();

			const res = await SELF.fetch("http://localhost/v1/user/me", {
				headers: {
					Cookie: `devicesdk-session=${token}`,
				},
			});
			const body = await res.json();
			expect(res.status).toBe(200);
			expect(body.result.id).toBe(user.id);
		});

		test("should call next middleware if token is valid in header", async () => {
			const token = "valid-token-2";
			const user = {
				id: "2",
				name: "test-user-2",
				email: "test-user-2@devicesdk.com",
				created_at: Date.now(),
				verified_email: 1,
				picture: "",
			};
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: user,
				})
				.execute();
			await qb
				.insert<tableUserSessions>({
					tableName: "user_sessions",
					data: {
						token,
						user_id: user.id,
						created_at: Date.now(),
						expires_at: Date.now() + 100000,
					},
				})
				.execute();

			const res = await SELF.fetch("http://localhost/v1/user/me", {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});
			const body = await res.json();
			expect(res.status).toBe(200);
			expect(body.result.id).toBe(user.id);
		});
	});

	describe("handleGoogleCallback function", () => {
		test("should create a new user and session if the user does not exist", async () => {
			const app = new Hono<{
				Bindings: { DB: D1Database; SALT_TOKEN: string };
				Variables: AppContext;
			}>();
			app.use("*", async (c, next) => {
				c.set("qb", new D1QB(env.DB));
				c.env = env;
				await next();
			});
			app.get(
				"/v1/auth/google",
				async (c, next) => {
					c.set("user-google", {
						name: "Test User",
						email: "test@google.com",
						picture: "https://google.com/avatar",
						verified_email: true,
					});
					await next();
				},
				handleGoogleCallback,
			);

			const res = await app.request("/v1/auth/google");
			const user = await qb
				.fetchOne({
					tableName: "user",
					where: {
						conditions: ["email = ?1"],
						params: ["test@google.com"],
					},
				})
				.execute();
			if (user.results) {
				const session = await qb
					.fetchOne({
						tableName: "user_sessions",
						where: {
							conditions: ["user_id = ?1"],
							params: [user.results.id],
						},
					})
					.execute();
				expect(session.results).not.toBeNull();
			}
			expect(user.results).not.toBeNull();
			expect(res.status).toBe(302);
			expect(res.headers.get("Location")).toBe("https://dash.devicesdk.com");
		});

		test("should create a new session if the user already exists", async () => {
			const app = new Hono<{
				Bindings: { DB: D1Database; SALT_TOKEN: string };
				Variables: AppContext;
			}>();
			app.use("*", async (c, next) => {
				c.set("qb", new D1QB(env.DB));
				c.env = env;
				await next();
			});
			app.get(
				"/v1/auth/google",
				async (c, next) => {
					c.set("user-google", {
						name: "Test User",
						email: "test-user-4@google.com",
						picture: "https://google.com/avatar",
						verified_email: true,
					});
					await next();
				},
				handleGoogleCallback,
			);

			const user = {
				id: "4",
				name: "test-user-4",
				email: "test-user-4@google.com",
				created_at: Date.now(),
				verified_email: 1,
				picture: "",
			};
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: user,
				})
				.execute();

			const res = await app.request("/v1/auth/google");
			const sessions = await qb
				.fetchAll<tableUserSessions>({
					tableName: "user_sessions",
					where: {
						conditions: ["user_id = ?1"],
						params: [user.id],
					},
				})
				.execute();

			expect(sessions.results?.length).toBe(1);
			expect(res.status).toBe(302);
			expect(res.headers.get("Location")).toBe("https://dash.devicesdk.com");
		});

		test("should return 500 if google does not provide an email", async () => {
			const app = new Hono<{
				Bindings: { DB: D1Database; SALT_TOKEN: string };
				Variables: AppContext;
			}>();
			app.onError((err, c) => {
				if (err instanceof ApiException) {
					const messages = err.buildResponse();
					return c.json(
						{
							success: false,
							error: messages[0]?.message || "Unknown error",
						},
						err.status as ContentfulStatusCode,
					);
				}
				if (err instanceof HTTPException) {
					return err.getResponse();
				}
				return c.json(
					{
						success: false,
						error: "Internal Server Error",
					},
					500,
				);
			});
			app.use("*", async (c, next) => {
				c.set("qb", new D1QB(env.DB));
				c.env = env;
				await next();
			});
			app.get(
				"/v1/auth/google",
				async (c, next) => {
					c.set("user-google", {
						name: "Test User",
						picture: "https://google.com/avatar",
						verified_email: true,
					});
					await next();
				},
				handleGoogleCallback,
			);

			const res = await app.request("/v1/auth/google");
			expect(res.status).toBe(500);
			const body = await res.json();
			expect(body.error).toBe("Google account does not have an email");
		});
	});

	describe("user suspension", () => {
		test("should return 403 for suspended user with session token", async () => {
			const res = await SELF.fetch("http://localhost/v1/user/me", {
				headers: {
					Authorization: `Bearer ${TEST_SUSPENDED_SESSION_TOKEN}`,
				},
			});
			expect(res.status).toBe(403);
			const body = (await res.json()) as {
				success: boolean;
				error: string;
			};
			expect(body.success).toBe(false);
			expect(body.error).toBe(
				"Account suspended. Contact support@devicesdk.com",
			);
		});

		test("should return 403 for suspended user with API token", async () => {
			// Create an API token for the suspended user
			const tokenValue = "suspended-user-api-token";
			const { hashToken } = await import("../../src/foundation/tokenHash");
			const tokenHash = await hashToken(tokenValue);
			await env.DB.prepare(
				"INSERT INTO tokens (id, user_id, token, token_hash, last_four, created_at) VALUES (?, ?, '', ?, ?, ?)",
			)
				.bind(
					"suspended-token-id",
					TEST_SUSPENDED_USER_ID,
					tokenHash,
					tokenValue.slice(-4),
					Date.now(),
				)
				.run();

			const res = await SELF.fetch("http://localhost/v1/user/me", {
				headers: {
					Authorization: `Bearer ${tokenValue}`,
				},
			});
			expect(res.status).toBe(403);
			const body = (await res.json()) as {
				success: boolean;
				error: string;
			};
			expect(body.success).toBe(false);
			expect(body.error).toBe(
				"Account suspended. Contact support@devicesdk.com",
			);
		});

		test("should include support email in suspension error response", async () => {
			const res = await SELF.fetch("http://localhost/v1/user/me", {
				headers: {
					Authorization: `Bearer ${TEST_SUSPENDED_SESSION_TOKEN}`,
				},
			});
			const body = (await res.json()) as {
				success: boolean;
				error: string;
			};
			expect(body.error).toContain("support@devicesdk.com");
		});
	});

	describe("logout session invalidation", () => {
		it("should delete session from database on logout", async () => {
			const logoutTestToken = "logout-test-token-12345";

			// Insert a test session
			await env.DB.prepare(
				"INSERT INTO user_sessions (user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?)",
			)
				.bind(TEST_USER_ID, logoutTestToken, Date.now(), Date.now() + 100000)
				.run();

			// Logout with this token
			const resp = await SELF.fetch("http://localhost/v1/auth/logout", {
				method: "POST",
				headers: { Cookie: `devicesdk-session=${logoutTestToken}` },
			});
			expect(resp.status).toBe(200);

			// Verify session is deleted from DB
			const session = await env.DB.prepare(
				"SELECT * FROM user_sessions WHERE token = ?",
			)
				.bind(logoutTestToken)
				.first();
			expect(session).toBeNull();
		});

		it("should return 401 for logout without session cookie", async () => {
			const resp = await SELF.fetch("http://localhost/v1/auth/logout", {
				method: "POST",
			});
			expect(resp.status).toBe(401);
		});
	});
});
