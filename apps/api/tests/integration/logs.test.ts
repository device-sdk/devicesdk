import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1QB } from "workers-qb";
import type { tableDevices, tableProjects } from "../../src/types";
import {
	TEST_PROJECT_ID,
	TEST_SESSION_TOKEN,
	TEST_USER_ID,
} from "../setup-test-data";

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

	describe("GET /v1/projects/:projectId/devices/:deviceId/logs", () => {
		it("should return empty logs for a device with no logs", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/log-device/logs",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(200);
			const json = (await resp.json()) as {
				success: boolean;
				result: {
					logs: Array<{
						id: string;
						level: string;
						message: string;
						created_at: number;
					}>;
					next_cursor: string | null;
				};
			};
			expect(json.success).toBe(true);
			expect(json.result.logs).toEqual([]);
			expect(json.result.next_cursor).toBeNull();
		});

		it("should return 404 for non-existent project", async () => {
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

		it("should return 404 for non-existent device", async () => {
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

		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/log-device/logs",
				{
					method: "GET",
				},
			);

			expect(resp.status).toBe(401);
		});

		it("should accept query parameters", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/log-device/logs?limit=10&level=error",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(200);
			const json = (await resp.json()) as {
				success: boolean;
				result: {
					logs: Array<{
						id: string;
						level: string;
						message: string;
						created_at: number;
					}>;
					next_cursor: string | null;
				};
			};
			expect(json.success).toBe(true);
			expect(json.result.logs).toEqual([]);
		});
	});
});
