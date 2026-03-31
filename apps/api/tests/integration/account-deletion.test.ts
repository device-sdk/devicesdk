import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1QB } from "workers-qb";
import { handleScheduled } from "../../src/scheduled";
import type { tableUser, tableUserSessions } from "../../src/types";
import {
	TEST_DELETION_SESSION_TOKEN,
	TEST_DELETION_USER_ID,
	TEST_USER_ID,
} from "../setup-test-data";

const mockCtx = {
	waitUntil: (_p: Promise<unknown>) => {},
};

describe.sequential("Account Deletion", () => {
	let qb: D1QB;

	beforeEach(async () => {
		qb = new D1QB(env.DB);
	});

	describe("DELETE /v1/user/me", () => {
		it("should mark account for deletion and invalidate sessions", async () => {
			const res = await SELF.fetch("http://localhost/v1/user/me", {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${TEST_DELETION_SESSION_TOKEN}`,
				},
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				success: boolean;
				result: { deletion_scheduled_at: number };
			};
			expect(body.success).toBe(true);
			expect(body.result.deletion_scheduled_at).toBeDefined();
			expect(body.result.deletion_scheduled_at).toBeGreaterThan(Date.now());

			// Verify user row has deletion_requested_at set
			const user = await env.DB.prepare(
				"SELECT deletion_requested_at FROM user WHERE id = ?",
			)
				.bind(TEST_DELETION_USER_ID)
				.first<{ deletion_requested_at: number }>();
			expect(user).not.toBeNull();
			expect(user?.deletion_requested_at).toBeGreaterThan(0);

			// Verify the token no longer works (sessions were deleted)
			const authRes = await SELF.fetch("http://localhost/v1/user/me", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${TEST_DELETION_SESSION_TOKEN}`,
				},
			});
			expect(authRes.status).toBe(401);
		});
	});

	describe("Auth check for pending-deletion user", () => {
		it("should return 403 with days remaining for pending-deletion user", async () => {
			const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
			const pendingUserId = "user-pending-deletion-test";
			const pendingToken = "pending-deletion-test-token";

			// Create a user with deletion_requested_at set to 2 days ago
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: pendingUserId,
						name: "Pending Delete",
						email: "pending-delete@example.com",
						verified_email: 1,
						plan: "free",
						deletion_requested_at: twoDaysAgo,
						created_at: Date.now(),
					},
				})
				.execute();

			// Create a session for this user
			await qb
				.insert<tableUserSessions>({
					tableName: "user_sessions",
					data: {
						user_id: pendingUserId,
						token: pendingToken,
						created_at: Date.now(),
						expires_at: Date.now() + 86400000,
					},
				})
				.execute();

			const res = await SELF.fetch("http://localhost/v1/user/me", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${pendingToken}`,
				},
			});

			expect(res.status).toBe(403);
			const body = (await res.json()) as {
				success: boolean;
				error: string;
			};
			expect(body.success).toBe(false);
			expect(body.error).toContain("5 days");
			expect(body.error).toContain("support@devicesdk.com");
		});
	});

	describe("Scheduled handler - account deletion", () => {
		it("should not delete users still in grace period", async () => {
			const recentUserId = "user-recent-deletion";
			const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

			// Create user with deletion_requested_at 3 days ago (within 7-day grace)
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: recentUserId,
						name: "Recent Delete",
						email: "recent-delete@example.com",
						verified_email: 1,
						plan: "free",
						deletion_requested_at: threeDaysAgo,
						created_at: Date.now(),
					},
				})
				.execute();

			await handleScheduled(
				{ cron: "0 * * * *", scheduledTime: Date.now() },
				env,
				mockCtx,
			);

			// User should still exist
			const user = await env.DB.prepare("SELECT id FROM user WHERE id = ?")
				.bind(recentUserId)
				.first();
			expect(user).not.toBeNull();
		});

		it("should delete users past grace period", async () => {
			const expiredUserId = "user-expired-deletion";
			const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;

			// Create user with deletion_requested_at 8 days ago (past 7-day grace)
			await qb
				.insert<tableUser>({
					tableName: "user",
					data: {
						id: expiredUserId,
						name: "Expired Delete",
						email: "expired-delete@example.com",
						verified_email: 1,
						plan: "free",
						deletion_requested_at: eightDaysAgo,
						created_at: Date.now(),
					},
				})
				.execute();

			await handleScheduled(
				{ cron: "0 * * * *", scheduledTime: Date.now() },
				env,
				mockCtx,
			);

			// User should be deleted
			const user = await env.DB.prepare("SELECT id FROM user WHERE id = ?")
				.bind(expiredUserId)
				.first();
			expect(user).toBeNull();
		});
	});
});

describe.sequential("Session Cleanup Cron", () => {
	let qb: D1QB;

	beforeEach(async () => {
		qb = new D1QB(env.DB);
	});

	it("should delete expired sessions", async () => {
		const expiredToken = "expired-session-cleanup-test";
		await qb
			.insert<tableUserSessions>({
				tableName: "user_sessions",
				data: {
					user_id: TEST_USER_ID,
					token: expiredToken,
					created_at: Date.now() - 100000,
					expires_at: Date.now() - 1000,
				},
			})
			.execute();

		// Verify it exists
		const before = await env.DB.prepare(
			"SELECT * FROM user_sessions WHERE token = ?",
		)
			.bind(expiredToken)
			.first();
		expect(before).not.toBeNull();

		await handleScheduled(
			{ cron: "0 * * * *", scheduledTime: Date.now() },
			env,
			mockCtx,
		);

		// Verify it's gone
		const after = await env.DB.prepare(
			"SELECT * FROM user_sessions WHERE token = ?",
		)
			.bind(expiredToken)
			.first();
		expect(after).toBeNull();
	});

	it("should not delete active sessions", async () => {
		const activeToken = "active-session-cleanup-test";
		await qb
			.insert<tableUserSessions>({
				tableName: "user_sessions",
				data: {
					user_id: TEST_USER_ID,
					token: activeToken,
					created_at: Date.now(),
					expires_at: Date.now() + 86400000,
				},
			})
			.execute();

		await handleScheduled(
			{ cron: "0 * * * *", scheduledTime: Date.now() },
			env,
			mockCtx,
		);

		// Verify it still exists
		const after = await env.DB.prepare(
			"SELECT * FROM user_sessions WHERE token = ?",
		)
			.bind(activeToken)
			.first();
		expect(after).not.toBeNull();
	});

	it("should delete expired rate limits", async () => {
		await env.DB.prepare(
			"INSERT INTO rate_limits (key, created_at, expires_at) VALUES (?, ?, ?)",
		)
			.bind("test:cleanup", Date.now() - 100000, Date.now() - 1000)
			.run();

		await handleScheduled(
			{ cron: "0 * * * *", scheduledTime: Date.now() },
			env,
			mockCtx,
		);

		const after = await env.DB.prepare(
			"SELECT * FROM rate_limits WHERE key = ?",
		)
			.bind("test:cleanup")
			.first();
		expect(after).toBeNull();
	});
});
