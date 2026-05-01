import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1QB } from "workers-qb";
import type { tableDevices, tableProjects } from "../../src/types";
import { TEST_PROJECT_ID, TEST_SESSION_TOKEN } from "../setup-test-data";

describe.sequential("Logs endpoint", () => {
	let qb: D1QB;

	beforeAll(async () => {
		qb = new D1QB(env.DB);

		// Ensure a device exists for log tests
		const now = Date.now();
		const project = (await qb
			.fetchOne<tableProjects>({
				tableName: "projects",
				where: {
					conditions: ["project_slug = ?1"],
					params: [TEST_PROJECT_ID],
				},
			})
			.execute()
			.then((p) => p.results)) as tableProjects;

		await qb
			.insert<tableDevices>({
				tableName: "devices",
				data: {
					id: "device-logs-test",
					project_id: project.id,
					device_slug: "log-device",
					name: "Log Test Device",
					created_at: now,
					updated_at: now,
				},
				onConflict: "IGNORE",
			})
			.execute();
	});

	describe("GET /v1/projects/:projectId/devices/:deviceId/logs (deprecated → 410)", () => {
		it("returns 410 with Link header pointing at the watcher WS for an existing project+device", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/log-device/logs",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(410);
			expect(resp.headers.get("Link")).toContain(
				'/v1/projects/smart-home/devices/log-device/watch>; rel="alternate"',
			);
			const json = (await resp.json()) as {
				success: boolean;
				error: string;
				code: string;
			};
			expect(json.success).toBe(false);
			expect(json.code).toBe("LOGS_DEPRECATED");
			expect(json.error).toContain("watcher WebSocket");
		});

		it("still returns 404 for non-existent project (callers can distinguish wrong URL from deprecation)", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/non-existent/devices/log-device/logs",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = (await resp.json()) as {
				success: boolean;
				error: string;
			};
			expect(json.success).toBe(false);
		});

		it("still returns 404 for non-existent device", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/non-existent/logs",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = (await resp.json()) as {
				success: boolean;
				error: string;
			};
			expect(json.success).toBe(false);
		});

		it("still returns 401 without auth (auth runs before the 410)", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/log-device/logs",
				{
					method: "GET",
				},
			);

			expect(resp.status).toBe(401);
		});

		it("query parameters do not change the deprecation response", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/log-device/logs?limit=10&level=error",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(410);
		});
	});

	describe("GET /v1/projects/:projectId/devices/:deviceId/logs/stream", () => {
		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/non-existent/devices/log-device/logs/stream",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
		});

		it("should return 404 for non-existent device", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/non-existent/logs/stream",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
		});

		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/log-device/logs/stream",
				{
					method: "GET",
				},
			);

			expect(resp.status).toBe(401);
		});
	});
});
