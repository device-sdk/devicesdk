import { env, SELF } from "cloudflare:test";
import { ApiException } from "chanfana";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { D1QB } from "workers-qb";
import { handleGoogleCallback, hashPassword } from "../../src/foundation/auth";
import type { AppContext, tableUser, tableUserSessions } from "../../src/types";

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
					return c.json(
						{ success: false, errors: err.buildResponse() },
						err.status as any,
					);
				}
				if (err instanceof HTTPException) {
					return err.getResponse();
				}
				return c.json(
					{
						success: false,
						errors: [{ code: 7000, message: "Internal Server Error" }],
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
			expect(body.errors[0].message).toBe(
				"Google account does not have an email",
			);
		});
	});
});
