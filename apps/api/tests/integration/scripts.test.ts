import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { D1QB } from "workers-qb";
import type {
	tableDeviceScripts,
	tableDevices,
	tableProjects,
} from "../../src/types";
import { TEST_PROJECT_ID, TEST_SESSION_TOKEN } from "../setup-test-data";

describe.sequential("Scripts endpoint", () => {
	let qb: D1QB;
	let project: tableProjects;
	let device: tableDevices;

	beforeAll(async () => {
		qb = new D1QB(env.DB);
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
						script:
							"export class Device { async onMessage() {} async onDeviceConnect() { console.log('connected'); } }",
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
						script:
							"export class Device { async onMessage() {} async onDeviceConnect() {} }",
					}),
				},
			);

			expect(resp.status).toBe(404);
		});

		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/non-existent-project/devices/${device.device_slug}/script`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						entrypoint: "Device",
						script:
							"export class Device { async onMessage() {} async onDeviceConnect() {} }",
					}),
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should reject script upload with code injection in entrypoint", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						entrypoint: "x}; class x{",
						script: "export class Device { async onMessage() {} }",
					}),
				},
			);
			expect(resp.status).toBe(400);
		});

		it("should reject script upload with spaces in entrypoint", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						entrypoint: "My Device",
						script: "export class Device { async onMessage() {} }",
					}),
				},
			);
			expect(resp.status).toBe(400);
		});

		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entrypoint: "Device",
						script:
							"export class Device { async onMessage() {} async onDeviceConnect() {} }",
					}),
				},
			);

			expect(resp.status).toBe(401);
		});
	});

	describe("GET /v1/projects/:projectId/devices/:deviceId/script", () => {
		beforeAll(async () => {
			// Upload a script in beforeAll so the R2 write persists across all
			// tests in this block (isolatedStorage rolls back it() writes).
			await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						entrypoint: "Device",
						script:
							"export class Device { async onMessage() {} async onDeviceConnect() {} }",
						message: "For getScript test",
					}),
				},
			);
		});

		it("should return the current script for a device with a deployed script", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script`,
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
			expect(typeof json.result.script).toBe("string");
			expect(json.result.version_id).toBeDefined();
		});

		it("should return 404 for a device with no script uploaded", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-no-script",
						project_id: project.id,
						device_slug: "sensor-no-script",
						name: "No Script Sensor",
						created_at: now,
						updated_at: now,
					},
					onConflict: "IGNORE",
				})
				.execute();

			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/sensor-no-script/script`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 404 for a non-existent device", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/does-not-exist/script`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 404 for a non-existent project", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/non-existent-project/devices/${device.device_slug}/script`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script`,
				{ method: "GET" },
			);

			expect(resp.status).toBe(401);
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

		it("should return 404 for a non-existent project", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/non-existent-project/devices/${device.device_slug}/script/versions`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 404 for a non-existent device", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/non-existent-device/script/versions`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script/versions`,
				{ method: "GET" },
			);

			expect(resp.status).toBe(401);
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
								script:
									"export class Device { async onMessage() {} async onDeviceConnect() { console.log('sensor 1'); } }",
							},
							"sensor-scripts-2": {
								entrypoint: "Device",
								script:
									"export class Device { async onMessage() {} async onDeviceConnect() { console.log('sensor 2'); } }",
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
								script:
									"export class Device { async onMessage() {} async onDeviceConnect() {} }",
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
							Invalid_Device_ID: {
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

		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/non-existent-project/scripts",
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						message: "Project not found test",
						devices: {
							"sensor-scripts-1": {
								entrypoint: "Device",
								script:
									"export class Device { async onMessage() {} async onDeviceConnect() {} }",
							},
						},
					}),
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/scripts`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						message: "Auth test",
						devices: {
							"sensor-scripts-1": {
								entrypoint: "Device",
								script:
									"export class Device { async onMessage() {} async onDeviceConnect() {} }",
							},
						},
					}),
				},
			);

			expect(resp.status).toBe(401);
		});
	});

	describe("GET /v1/projects/:projectId/devices/:deviceId/script/versions/:versionId", () => {
		let versionId: string;

		beforeAll(async () => {
			// Upload a fresh script version to get a versionId that has both a DB record and an R2 file
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
						script:
							"export class Device { async onMessage() {} async onDeviceConnect() { console.log('get-version test'); } }",
						message: "Version for getVersion test",
					}),
				},
			);
			const json = await resp.json();
			versionId = json.result.version_id;
		});

		it("should return a specific version by ID", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script/versions/${versionId}`,
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
			expect(json.result.version_id).toBe(versionId);
			expect(json.result.message).toBe("Version for getVersion test");
			expect(typeof json.result.script).toBe("string");
			expect(typeof json.result.created_at).toBe("number");
		});

		it("should return 404 for a non-existent version", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script/versions/non-existent-version`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 404 for a non-existent project", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/non-existent-project/devices/${device.device_slug}/script/versions/${versionId}`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 404 for a non-existent device", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/non-existent-device/script/versions/${versionId}`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script/versions/${versionId}`,
				{ method: "GET" },
			);

			expect(resp.status).toBe(401);
		});
	});

	describe("POST /v1/projects/:projectId/devices/:deviceId/script/versions/:versionId/deploy", () => {
		let versionId: string;

		beforeAll(async () => {
			// Upload a fresh script version to get a versionId with both a DB record and an R2 file
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
						script:
							"export class Device { async onMessage() {} async onDeviceConnect() { console.log('deploy test'); } }",
						message: "Version for deploy test",
					}),
				},
			);
			const json = await resp.json();
			versionId = json.result.version_id;
		});

		it("should deploy a specific version (rollback)", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script/versions/${versionId}/deploy`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(200);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.version_id).toBe(versionId);
			expect(json.result.device_id).toBe(device.device_slug);
			expect(typeof json.result.deployed_at).toBe("number");
			expect(typeof json.result.device_rebooted).toBe("boolean");
		});

		it("should return 404 for a non-existent version", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script/versions/non-existent-version/deploy`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 404 for a non-existent project", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/non-existent-project/devices/${device.device_slug}/script/versions/${versionId}/deploy`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 404 for a non-existent device", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/non-existent-device/script/versions/${versionId}/deploy`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/${device.device_slug}/script/versions/${versionId}/deploy`,
				{ method: "POST" },
			);

			expect(resp.status).toBe(401);
		});
	});
});
