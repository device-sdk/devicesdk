import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1QB } from "workers-qb";
import {
	TEST_FREE_SESSION_TOKEN,
	TEST_FREE_USER_ID,
	TEST_SESSION_TOKEN,
} from "../setup-test-data";

// Resets the free user's owned projects so each test starts at 0/3. This
// replaces the fragile `if (403) delete previous project and retry` pattern
// that previously coupled tests to execution order.
async function resetFreeUserProjects(): Promise<void> {
	const qb = new D1QB(env.DB);
	await qb
		.delete({
			tableName: "projects",
			where: {
				conditions: ["user_id = ?1"],
				params: [TEST_FREE_USER_ID],
			},
		})
		.execute();
}

describe.sequential("Usage limits enforcement", () => {
	beforeEach(async () => {
		// Fresh slate for every test in this file — limit tests only work
		// when the free user starts at 0 projects.
		await resetFreeUserProjects();
	});

	describe("Project creation limits", () => {
		it("should block free user from creating more than 3 projects", async () => {
			// Create 3 projects (free tier limit)
			for (let i = 1; i <= 3; i++) {
				const resp = await SELF.fetch("http://localhost/v1/projects", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						project_slug: `free-proj-${i}`,
					}),
				});
				expect(resp.status).toBe(201);
			}

			// 4th project should be blocked
			const resp = await SELF.fetch("http://localhost/v1/projects", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
				},
				body: JSON.stringify({
					project_slug: "free-proj-4",
				}),
			});

			expect(resp.status).toBe(403);
			const json = await resp.json();
			expect(json.success).toBe(false);
			expect(json.error).toContain("Free tier limit reached");
			expect(json.error).toContain("3/3 projects");
			expect(json.error).toContain("support@devicesdk.com");
		});

		it("should allow paid user to create more than 3 projects", async () => {
			for (let i = 1; i <= 5; i++) {
				const resp = await SELF.fetch("http://localhost/v1/projects", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						project_slug: `paid-limit-proj-${i}`,
					}),
				});
				expect(resp.status).toBe(201);
			}
		});
	});

	describe("Device creation limits", () => {
		it("should block free user from creating more than 5 devices in a project", async () => {
			// beforeEach resets projects so the free user starts at 0/3.
			const projResp = await SELF.fetch("http://localhost/v1/projects", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
				},
				body: JSON.stringify({ project_slug: "dev-limit-test" }),
			});
			expect(projResp.status).toBe(201);

			for (let i = 1; i <= 5; i++) {
				const resp = await SELF.fetch(
					"http://localhost/v1/projects/dev-limit-test/devices",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
						},
						body: JSON.stringify({
							device_id: `free-dev-${i}`,
						}),
					},
				);
				expect(resp.status).toBe(201);
			}

			// 6th should be blocked
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/dev-limit-test/devices",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						device_id: "free-dev-6",
					}),
				},
			);

			expect(resp.status).toBe(403);
			const json = await resp.json();
			expect(json.success).toBe(false);
			expect(json.error).toContain("Free tier limit reached");
			expect(json.error).toContain("devices");
		});
	});

	describe("API token limits", () => {
		it("should block free user from creating more than 5 API tokens", async () => {
			for (let i = 1; i <= 5; i++) {
				const resp = await SELF.fetch("http://localhost/v1/tokens", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						description: `free-token-${i}`,
					}),
				});
				expect(resp.status).toBe(201);
			}

			// 6th should be blocked
			const resp = await SELF.fetch("http://localhost/v1/tokens", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
				},
				body: JSON.stringify({
					description: "free-token-6",
				}),
			});

			expect(resp.status).toBe(403);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});
	});

	describe("Script version FIFO pruning", () => {
		it("should auto-prune oldest non-current version when at limit", async () => {
			// beforeEach resets projects so the free user starts at 0/3.
			const projResp = await SELF.fetch("http://localhost/v1/projects", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
				},
				body: JSON.stringify({ project_slug: "fifo-test" }),
			});
			expect(projResp.status).toBe(201);

			const devResp = await SELF.fetch(
				"http://localhost/v1/projects/fifo-test/devices",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ device_id: "fifo-device" }),
				},
			);
			expect(devResp.status).toBe(201);

			const scriptBody = (n: number) =>
				JSON.stringify({
					entrypoint: "Device",
					script: `export class Device { async onMessage() { return ${n}; } async onDeviceConnect() {} }`,
					message: `version ${n}`,
				});

			const versionIds: string[] = [];
			// Upload 5 versions (free tier limit)
			for (let i = 1; i <= 5; i++) {
				const resp = await SELF.fetch(
					"http://localhost/v1/projects/fifo-test/devices/fifo-device/script",
					{
						method: "PUT",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
						},
						body: scriptBody(i),
					},
				);
				expect(resp.status).toBe(201);
				const json = await resp.json();
				versionIds.push(json.result.version_id);
			}

			// Upload a 6th version — should succeed via FIFO pruning, not 403
			const resp6 = await SELF.fetch(
				"http://localhost/v1/projects/fifo-test/devices/fifo-device/script",
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
					},
					body: scriptBody(6),
				},
			);
			expect(resp6.status).toBe(201);

			// List versions — should have exactly 5
			const listResp = await SELF.fetch(
				"http://localhost/v1/projects/fifo-test/devices/fifo-device/script/versions",
				{
					headers: {
						Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
					},
				},
			);
			expect(listResp.status).toBe(200);
			const listJson = await listResp.json();
			expect(listJson.result).toHaveLength(5);

			// The oldest version (version 1) should have been pruned
			const remainingIds = listJson.result.map(
				(v: { version_id: string }) => v.version_id,
			);
			expect(remainingIds).not.toContain(versionIds[0]);

			// The current version (version 5, which was current before upload 6) should still exist
			// Actually version 6 is now current; version 5 was the previous current.
			// But version 5 was current_version_id when we pruned, so it was protected.
			// After upload 6, version 6 becomes current. Let's verify the current one exists.
			const currentVersion = listJson.result.find(
				(v: { is_current: boolean }) => v.is_current,
			);
			expect(currentVersion).toBeDefined();
			expect(currentVersion.message).toBe("version 6");
		});
	});

	describe("Managed tokens excluded from API token limit", () => {
		it("should not count managed device tokens toward user token limit", async () => {
			// Insert a managed token directly for the free user
			await env.DB.prepare(
				"INSERT INTO tokens (id, user_id, token, token_hash, last_four, managed, created_at) VALUES (?, ?, '', 'managed-hash-1', '0001', 1, ?)",
			)
				.bind("managed-token-1", TEST_FREE_USER_ID, Date.now())
				.run();
			await env.DB.prepare(
				"INSERT INTO tokens (id, user_id, token, token_hash, last_four, managed, created_at) VALUES (?, ?, '', 'managed-hash-2', '0002', 1, ?)",
			)
				.bind("managed-token-2", TEST_FREE_USER_ID, Date.now())
				.run();

			// Free user should still be able to create 5 user API tokens
			// (the existing test already created 5, so let's check user/me usage doesn't include managed)
			const meResp = await SELF.fetch("http://localhost/v1/user/me", {
				headers: {
					Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
				},
			});
			expect(meResp.status).toBe(200);
			const meJson = await meResp.json();

			// The managed tokens should NOT be counted in usage
			// Count only non-managed tokens in the DB to verify
			const nonManagedCount = await env.DB.prepare(
				"SELECT COUNT(*) as count FROM tokens WHERE user_id = ? AND (managed = 0 OR managed IS NULL)",
			)
				.bind(TEST_FREE_USER_ID)
				.first<{ count: number }>();
			expect(meJson.result.usage.api_tokens).toBe(nonManagedCount?.count ?? 0);

			// Clean up managed tokens
			await env.DB.prepare(
				"DELETE FROM tokens WHERE id IN ('managed-token-1', 'managed-token-2')",
			).run();
		});
	});

	describe("User details includes plan and limits", () => {
		it("should return plan, limits, and usage for paid user", async () => {
			const resp = await SELF.fetch("http://localhost/v1/user/me", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
				},
			});

			expect(resp.status).toBe(200);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.plan).toBe("paid");
			expect(json.result.limits).toBeDefined();
			expect(json.result.limits.max_projects).toBe(30);
			expect(json.result.limits.max_devices_per_project).toBe(50);
			expect(json.result.limits.max_messages_per_device_per_day).toBe(50000);
			expect(json.result.usage).toBeDefined();
			expect(json.result.usage.projects).toBeGreaterThanOrEqual(0);
			expect(json.result.usage.api_tokens).toBeGreaterThanOrEqual(0);
		});

		it("should return free plan limits for free user", async () => {
			const resp = await SELF.fetch("http://localhost/v1/user/me", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
				},
			});

			expect(resp.status).toBe(200);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.plan).toBe("free");
			expect(json.result.limits.max_projects).toBe(3);
			expect(json.result.limits.max_devices_per_project).toBe(5);
			expect(json.result.limits.max_messages_per_device_per_day).toBe(500);
		});
	});
});
