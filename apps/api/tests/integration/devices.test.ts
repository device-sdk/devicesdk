import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { D1QB } from "workers-qb";
import type {
	tableProjects,
	tableUser,
	tableUserSessions,
	tableDevices,
} from "../../src/types";
import {TEST_SESSION_TOKEN, TEST_PROJECT_ID, TEST_USER_ID} from "../setup-test-data";

describe.sequential("Devices endpoint", () => {
	let qb: D1QB;
	let project: tableProjects;

	beforeAll(async () => {
		qb = new D1QB(env.DB);
		project = await qb
			.fetchOne<tableProjects>({
				tableName: "projects",
				where: {
					conditions: ["project_slug = ?1"],
					params: [TEST_PROJECT_ID],
				},
			})
			.execute()
			.then((p) => p.results) as tableProjects;
	});

	beforeEach(async () => {});

	describe("POST /v1/projects/:projectId/devices", () => {
		it("should create a new device", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						device_id: "sensor-1",
						name: "Temperature Sensor",
						description: "Living room sensor",
					}),
				},
			);

			expect(resp.status).toBe(201);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.device_id).toBe("sensor-1");
			expect(json.result.name).toBe("Temperature Sensor");

			const device = await qb
				.fetchOne<tableDevices>({
					tableName: "devices",
					where: {
						conditions: ["device_slug = ?1"],
						params: ["sensor-1"],
					},
				})
				.execute()
				.then((d) => d.results);
			expect(device).toBeDefined();
			expect(device?.name).toBe("Temperature Sensor");
		});

		it("should return 409 for duplicate device_id within project", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-123",
						project_id: project.id,
						device_slug: "sensor-123",
						name: "Existing Sensor",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						device_id: "sensor-123",
						name: "Another Sensor",
					}),
				},
			);

			expect(resp.status).toBe(409);
			const json = await resp.json();
			expect(json.success).toBe(false);
			expect(json.error).toContain("already exists");
		});

		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/non-existent/devices",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						device_id: "sensor-1",
						name: "Test Sensor",
					}),
				},
			);

			expect(resp.status).toBe(404);
		});
	});

	describe("GET /v1/projects/:projectId/devices", () => {
		it("should list all devices for a project", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-2",
						project_id: project.id,
						device_slug: "sensor-2",
						name: "Sensor 2",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-6",
						project_id: project.id,
						device_slug: "sensor-6",
						name: "Sensor 6",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(200);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.length).toBe(2);
		});

		it("should return empty array for project with no devices", async () => {
			await qb
				.insert({
					tableName: "projects",
					data: {
						id: "proj-empty",
						user_id: TEST_USER_ID,
						project_slug: "proj-empty",
						name: "proj-empty",
						description: "proj-empty",
						created_at: Date.now(),
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/proj-empty/devices",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(200);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.length).toBe(0);
		});
	});

	describe("GET /v1/projects/:projectId/devices/:deviceId", () => {
		it("should get a single device", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-3",
						project_id: project.id,
						device_slug: "sensor-3",
						name: "Temperature Sensor",
						description: "Main sensor",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/sensor-3",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(200);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.device_id).toBe("sensor-3");
			expect(json.result.name).toBe("Temperature Sensor");
		});

		it("should return 404 for non-existent device", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/non-existent",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
		});
	});

	describe("PUT /v1/projects/:projectId/devices/:deviceId", () => {
		it("should update a device", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-4",
						project_id: project.id,
						device_slug: "sensor-4",
						name: "Old Name",
						description: "Old description",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/sensor-4",
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						name: "New Name",
						description: "New description",
					}),
				},
			);

			expect(resp.status).toBe(200);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.name).toBe("New Name");
			expect(json.result.description).toBe("New description");
		});
	});

	describe("DELETE /v1/projects/:projectId/devices/:deviceId", () => {
		it("should delete a device", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-5",
						project_id: project.id,
						device_slug: "sensor-5",
						name: "Sensor 5",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/sensor-5",
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(200);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.deleted).toBe(true);

			const device = await qb
				.fetchOne<tableDevices>({
					tableName: "devices",
					where: {
						conditions: ["device_slug = ?1"],
						params: ["sensor-5"],
					},
				})
				.execute()
				.then((d) => d.results);
			expect(device).toBeUndefined();
		});

		it("should return 404 for non-existent device", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/non-existent",
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
		});
	});
});
