import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1QB } from "workers-qb";
import type { tableProjectEnvVars, tableProjects } from "../../src/types";
import { TEST_PROJECT_ID, TEST_SESSION_TOKEN } from "../setup-test-data";

describe.sequential("Env Vars endpoint", () => {
	let qb: D1QB;
	let project: tableProjects;

	beforeEach(async () => {
		qb = new D1QB(env.DB);

		// Clean env vars before each test
		await env.DB.prepare("DELETE FROM project_env_vars").run();

		project = (await qb
			.fetchOne<tableProjects>({
				tableName: "projects",
				where: {
					conditions: ["project_slug = ?1"],
					params: [TEST_PROJECT_ID],
				},
			})
			.execute()
			.then((p) => p.results)) as tableProjects;
	});

	// --- Auth tests ---
	describe("GET /v1/projects/:projectId/env (unauthenticated)", () => {
		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`,
			);
			expect(resp.status).toBe(401);
		});
	});

	describe("PUT /v1/projects/:projectId/env (unauthenticated)", () => {
		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ vars: { MY_KEY: "value" } }),
				},
			);
			expect(resp.status).toBe(401);
		});
	});

	describe("DELETE /v1/projects/:projectId/env/:key (unauthenticated)", () => {
		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env/MY_KEY`,
				{ method: "DELETE" },
			);
			expect(resp.status).toBe(401);
		});
	});

	// --- 404 tests ---
	describe("GET /v1/projects/:projectId/env (project not found)", () => {
		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/does-not-exist/env",
				{
					headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
				},
			);
			expect(resp.status).toBe(404);
		});
	});

	describe("PUT /v1/projects/:projectId/env (project not found)", () => {
		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/does-not-exist/env",
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ vars: { MY_KEY: "value" } }),
				},
			);
			expect(resp.status).toBe(404);
		});
	});

	describe("DELETE /v1/projects/:projectId/env/:key (project not found)", () => {
		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/does-not-exist/env/MY_KEY",
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
				},
			);
			expect(resp.status).toBe(404);
		});
	});

	// --- Set env var tests ---
	describe("PUT /v1/projects/:projectId/env", () => {
		it("should set a single env var", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						vars: { DISCORD_WEBHOOK_URL: "https://example.com/hook" },
					}),
				},
			);

			expect(resp.status).toBe(200);
			const json = await resp.json<{
				success: boolean;
				result: { count: number };
			}>();
			expect(json.success).toBe(true);
			expect(json.result.count).toBe(1);

			const row = await qb
				.fetchOne<tableProjectEnvVars>({
					tableName: "project_env_vars",
					where: {
						conditions: ["project_id = ?1", "key = ?2"],
						params: [project.id, "DISCORD_WEBHOOK_URL"],
					},
				})
				.execute()
				.then((r) => r.results);

			expect(row).toBeTruthy();
			expect(row?.value).toBe("https://example.com/hook");
		});

		it("should set multiple env vars at once", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						vars: {
							KEY_ONE: "value1",
							KEY_TWO: "value2",
							KEY_THREE: "value3",
						},
					}),
				},
			);

			expect(resp.status).toBe(200);
			const json = await resp.json<{
				success: boolean;
				result: { count: number };
			}>();
			expect(json.result.count).toBe(3);
		});

		it("should upsert (overwrite) an existing env var", async () => {
			// Set initial value
			await SELF.fetch(`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
				},
				body: JSON.stringify({ vars: { MY_KEY: "original" } }),
			});

			// Overwrite
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ vars: { MY_KEY: "updated" } }),
				},
			);

			expect(resp.status).toBe(200);

			const row = await qb
				.fetchOne<tableProjectEnvVars>({
					tableName: "project_env_vars",
					where: {
						conditions: ["project_id = ?1", "key = ?2"],
						params: [project.id, "MY_KEY"],
					},
				})
				.execute()
				.then((r) => r.results);

			expect(row?.value).toBe("updated");

			// Only one row should exist
			const all = await qb
				.fetchAll<tableProjectEnvVars>({
					tableName: "project_env_vars",
					where: {
						conditions: ["project_id = ?1", "key = ?2"],
						params: [project.id, "MY_KEY"],
					},
				})
				.execute()
				.then((r) => r.results ?? []);
			expect(all.length).toBe(1);
		});

		it("should reject invalid key format (lowercase)", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ vars: { lowercase_key: "value" } }),
				},
			);

			expect(resp.status).toBe(400);
		});

		it("should reject value exceeding 4096 bytes", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ vars: { BIG_VALUE: "x".repeat(4097) } }),
				},
			);

			expect(resp.status).toBe(400);
		});

		it("should reject when adding a new var would exceed the 50-var limit", async () => {
			// Seed exactly 50 env vars
			const vars: Record<string, string> = {};
			for (let i = 1; i <= 50; i++) {
				vars[`VAR_${String(i).padStart(3, "0")}`] = `value${i}`;
			}
			const seedResp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ vars }),
				},
			);
			expect(seedResp.status).toBe(200);

			// Attempt to add a 51st new var — must be rejected
			const overLimitResp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ vars: { NEW_KEY_51: "overflow" } }),
				},
			);
			expect(overLimitResp.status).toBe(422);

			// Updating an existing var at the 50-var boundary must still succeed
			const updateResp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ vars: { VAR_001: "updated" } }),
				},
			);
			expect(updateResp.status).toBe(200);
		});
	});

	// --- List env var tests ---
	describe("GET /v1/projects/:projectId/env", () => {
		it("should list env var keys without values", async () => {
			// Seed a var
			await SELF.fetch(`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
				},
				body: JSON.stringify({ vars: { SECRET_TOKEN: "supersecret" } }),
			});

			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`,
				{
					headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
				},
			);

			expect(resp.status).toBe(200);
			const json = await resp.json<{
				success: boolean;
				result: { vars: Array<{ key: string; updated_at: number }> };
			}>();

			expect(json.success).toBe(true);
			expect(json.result.vars.length).toBe(1);
			expect(json.result.vars[0].key).toBe("SECRET_TOKEN");
			expect(json.result.vars[0].updated_at).toBeTypeOf("number");
			// Ensure the value is NOT present in the response
			expect(
				(json.result.vars[0] as Record<string, unknown>).value,
			).toBeUndefined();
		});

		it("should return empty array when no vars exist", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`,
				{
					headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
				},
			);

			expect(resp.status).toBe(200);
			const json = await resp.json<{
				success: boolean;
				result: { vars: unknown[] };
			}>();
			expect(json.result.vars).toEqual([]);
		});
	});

	// --- Delete env var tests ---
	describe("DELETE /v1/projects/:projectId/env/:key", () => {
		it("should delete an existing env var", async () => {
			// Seed
			await SELF.fetch(`http://localhost/v1/projects/${TEST_PROJECT_ID}/env`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
				},
				body: JSON.stringify({ vars: { TO_DELETE: "bye" } }),
			});

			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env/TO_DELETE`,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
				},
			);

			expect(resp.status).toBe(200);
			const json = await resp.json<{
				success: boolean;
				result: { deleted: boolean; key: string };
			}>();
			expect(json.success).toBe(true);
			expect(json.result.deleted).toBe(true);
			expect(json.result.key).toBe("TO_DELETE");

			const row = await qb
				.fetchOne<tableProjectEnvVars>({
					tableName: "project_env_vars",
					where: {
						conditions: ["project_id = ?1", "key = ?2"],
						params: [project.id, "TO_DELETE"],
					},
				})
				.execute()
				.then((r) => r.results);

			expect(row).toBeFalsy();
		});

		it("should return 404 when deleting a non-existent key", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/env/NONEXISTENT`,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
				},
			);

			expect(resp.status).toBe(404);
		});
	});
});
