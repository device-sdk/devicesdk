import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { D1QB } from "workers-qb";
import type {
	tableProjects,
	tableUser,
	tableUserSessions,
	tableDevices,
	tableDeviceScripts,
} from "../../src/types";
import { TEST_SESSION_TOKEN, TEST_PROJECT_ID, TEST_USER_ID } from "../setup-test-data";

describe.sequential("Scripts endpoint", () => {
	let qb: D1QB;
	let project: tableProjects;
	let device: tableDevices;

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

		const now = Date.now();
		device = await qb
			.insert<tableDevices>({
				tableName: "devices",
				data: {
					id: "device-scripts-1",
					project_id: project.id,
					device_slug: "sensor-scripts-1",
					name: "Temperature Sensor",
					created_at: now,
					updated_at: now,
				},
				returning: "*",
			})
			.execute()
			.then((d) => d.results);
	});

	beforeEach(async () => {});

	describe("PUT /v1/projects/:projectId/devices/:deviceId/script", () => {
		it("should upload a new script version", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
					entrypoint: "Device",
					script: "export class Device { async onMessage() {} async onDeviceConnect() { console.log('connected'); } }",
						message: "Initial version",
					}),
				},
			);

			expect(resp.status).toBe(201);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.version_id).toBeDefined();
			expect(json.result.message).toBe("Initial version");

			const scriptVersion = await qb
				.fetchOne<tableDeviceScripts>({
					tableName: "device_scripts",
					where: {
						conditions: ["device_id = ?1"],
						params: [device.id],
					},
				})
				.execute()
				.then((s) => s.results);
			expect(scriptVersion).toBeDefined();
		});

		it("should return 400 for invalid script", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
					entrypoint: "Device",
					script: "this is not valid javascript {{{",
						message: "Bad script",
					}),
				},
			);

			expect(resp.status).toBe(400);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 404 for non-existent device", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/non-existent/script`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
					entrypoint: "Device",
					script: "export class Device { async onMessage() {} async onDeviceConnect() {} }",
					}),
				},
			);

			expect(resp.status).toBe(404);
		});
	});

	describe("GET /v1/projects/:projectId/devices/:deviceId/script/versions", () => {
		it("should list all script versions for a device", async () => {
			const now = Date.now();
			await qb
				.insert<tableDeviceScripts>({
					tableName: "device_scripts",
					data: {
						id: "script-100",
						device_id: device.id,
						version_id: "v1-uuid",
					entrypoint: "Device",
					message: "First version",
						created_at: now - 1000,
					},
				})
				.execute();

			await qb
				.insert<tableDeviceScripts>({
					tableName: "device_scripts",
					data: {
						id: "script-200",
						device_id: device.id,
						version_id: "v2-uuid",
					entrypoint: "Device",
					message: "Second version",
						created_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script/versions`,
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
			expect(json.result[0].version_id).toBe("v2-uuid");
			expect(json.result[1].version_id).toBe("v1-uuid");
		});

		it("should return empty array for device with no scripts", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-scripts-3",
						project_id: project.id,
						device_slug: "sensor-scripts-3",
						name: "Sensor 3",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/sensor-scripts-3/script/versions`,
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

	describe("PUT /v1/projects/:projectId/scripts (batch upload)", () => {
		it("should upload scripts for multiple devices", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-scripts-2",
						project_id: project.id,
						device_slug: "sensor-scripts-2",
						name: "Sensor 2",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/scripts`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
					message: "Batch update",
					devices: {
							"sensor-scripts-1": {
						entrypoint: "Device",
						script: "export class Device { async onMessage() {} async onDeviceConnect() { console.log('sensor 1'); } }",
							},
							"sensor-scripts-2": {
						entrypoint: "Device",
						script: "export class Device { async onMessage() {} async onDeviceConnect() { console.log('sensor 2'); } }",
							},
						},
					}),
				},
			);

			expect(resp.status).toBe(201);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.versions.length).toBe(2);
		});

		it("should auto-create devices that don't exist", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/scripts`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
					message: "Auto-create test",
					devices: {
							"new-device": {
						entrypoint: "Device",
						script: "export class Device { async onMessage() {} async onDeviceConnect() {} }",
							},
						},
					}),
				},
			);

			expect(resp.status).toBe(201);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.versions[0].status).toBe("created");

			const newDevice = await qb
				.fetchOne<tableDevices>({
					tableName: "devices",
					where: {
						conditions: ["device_slug = ?1"],
						params: ["new-device"],
					},
				})
				.execute()
				.then((d) => d.results);
			expect(newDevice).toBeDefined();
		});

		it("should return 400 for invalid device_id in batch", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/scripts`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
					message: "Invalid ID test",
					devices: {
							"Invalid_Device_ID": {
						entrypoint: "Device",
						script: "export class Device {}",
							},
						},
					}),
				},
			);

			expect(resp.status).toBe(400);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 400 if any script validation fails", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/scripts`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
					message: "Bad script test",
					devices: {
							"sensor-scripts-1": {
						entrypoint: "Device",
						script: "this is not valid javascript {{{",
							},
						},
					}),
				},
			);

			expect(resp.status).toBe(400);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});
	});
});
