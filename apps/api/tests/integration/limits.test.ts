import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
	TEST_FREE_SESSION_TOKEN,
	TEST_SESSION_TOKEN,
} from "../setup-test-data";

describe.sequential("Usage limits enforcement", () => {
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
			// Create a project for this test
			const projResp = await SELF.fetch("http://localhost/v1/projects", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
				},
				body: JSON.stringify({ project_slug: "dev-limit-test" }),
			});
			// May be 201 or 403 (if project limit already reached from prior test)
			// If 403, the free user already has 3 projects. Delete one first.
			if (projResp.status === 403) {
				await SELF.fetch("http://localhost/v1/projects/free-proj-3", {
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
					},
				});
				const retryResp = await SELF.fetch("http://localhost/v1/projects", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_FREE_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ project_slug: "dev-limit-test" }),
				});
				expect(retryResp.status).toBe(201);
			}

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
