import { env, SELF } from "cloudflare:test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { D1QB } from "workers-qb";
import type { tableDevices, tableProjects } from "../../src/types";
import {
	TEST_PROJECT_ID,
	TEST_SESSION_TOKEN,
	TEST_USER_ID,
} from "../setup-test-data";

describe.sequential("Devices endpoint", () => {
	let qb: D1QB;
	let project: tableProjects;

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
	});

	beforeEach(async () => {
		// Per-test cleanup so device-creating tests don't trip the
		// (project_id, device_slug) UNIQUE constraint on re-insert. The two
		// firmware devices below are seeded by the firmware describe's beforeAll
		// and must persist for that block's tests. (Pool-workers 0.13+ removed
		// isolatedStorage, so writes now persist across it() blocks.)
		await env.DB.prepare(
			"DELETE FROM devices WHERE id NOT IN ('device-fw-test', 'device-fw-token-test')",
		).run();
	});

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

		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						device_id: "sensor-1",
						name: "Test Sensor",
					}),
				},
			);

			expect(resp.status).toBe(401);
		});

		it("should return 400 for device_id with uppercase letters", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						device_id: "Sensor-1",
						name: "Invalid Sensor",
					}),
				},
			);

			expect(resp.status).toBe(400);
			const json = await resp.json();
			expect(json.success).toBe(false);
			expect(json.error).toContain("Invalid device_id format");
		});

		it("should return 400 for device_id starting with a digit", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						device_id: "1sensor",
						name: "Invalid Sensor",
					}),
				},
			);

			expect(resp.status).toBe(400);
			const json = await resp.json();
			expect(json.success).toBe(false);
			expect(json.error).toContain("Invalid device_id format");
		});

		it("should return 400 for device_id with spaces", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						device_id: "my sensor",
						name: "Invalid Sensor",
					}),
				},
			);

			expect(resp.status).toBe(400);
			const json = await resp.json();
			expect(json.success).toBe(false);
			expect(json.error).toContain("Invalid device_id format");
		});
	});

	describe("GET /v1/projects/:projectId/devices", () => {
		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/non-existent/devices",
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
				"http://localhost/v1/projects/smart-home/devices",
				{
					method: "GET",
				},
			);

			expect(resp.status).toBe(401);
		});

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
			expect(json.result.items.length).toBe(2);
			expect(json.result.has_more).toBe(false);
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
			expect(json.result.items.length).toBe(0);
			expect(json.result.has_more).toBe(false);
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

		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/non-existent-project/devices/sensor-3",
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
				"http://localhost/v1/projects/smart-home/devices/sensor-3",
				{
					method: "GET",
				},
			);

			expect(resp.status).toBe(401);
		});
	});

	describe("PUT /v1/projects/:projectId/devices/:deviceId", () => {
		it("should return 404 for non-existent device", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/non-existent",
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ name: "New Name" }),
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/non-existent/devices/sensor-4",
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ name: "New Name" }),
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/sensor-4",
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ name: "New Name" }),
				},
			);

			expect(resp.status).toBe(401);
		});

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

		it("should update only device name, leaving description unchanged", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-4b",
						project_id: project.id,
						device_slug: "sensor-4b",
						name: "Original Name",
						description: "Original description",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/sensor-4b",
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ name: "Updated Name" }),
				},
			);

			expect(resp.status).toBe(200);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.name).toBe("Updated Name");
			expect(json.result.description).toBe("Original description");
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

		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/non-existent/devices/sensor-5",
				{
					method: "DELETE",
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
				"http://localhost/v1/projects/smart-home/devices/sensor-5",
				{
					method: "DELETE",
				},
			);

			expect(resp.status).toBe(401);
		});
	});

	describe("POST /v1/projects/:projectId/devices/:deviceId/firmware", () => {
		// Placeholder strings baked into the firmware binary at build time
		const OLD_TOKEN = "e343ecb8036442e093a47718463c1716";
		const OLD_SSID = "8d477eda147344f8b9b8d3e3bef7505b";
		const OLD_PASS =
			"ebc8394548904aa583916609049d5ea527021de49780437a98915189223dcf8";
		const OLD_HOST = "3ed66c2c3ed1474382278f70ba01dc4c";
		const OLD_PROJECT_ID = "288f2d2493094af68ab37a96ef73a118";
		const OLD_DEVICE_ID = "d09f91a7729141eb8911d7a0f1e1595f";

		beforeAll(async () => {
			// Create a device dedicated to firmware download tests
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-fw-test",
						project_id: project.id,
						device_slug: "fw-device",
						name: "Firmware Test Device",
						created_at: now,
						updated_at: now,
					},
					onConflict: "IGNORE",
				})
				.execute();

			// Create a separate device used exclusively by the managed-token test
			// so that the token creation on "first download" is genuinely exercised.
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-fw-token-test",
						project_id: project.id,
						device_slug: "fw-token-device",
						name: "Firmware Token Test Device",
						created_at: now,
						updated_at: now,
					},
					onConflict: "IGNORE",
				})
				.execute();

			// Build a valid 1-block UF2 with placeholder strings embedded in the payload.
			// The patching logic searches for these byte sequences, and UF2 structure
			// validation now runs after patching — so the binary must pass both paths.
			const encoder = new TextEncoder();
			const parts = [
				OLD_TOKEN,
				OLD_SSID,
				OLD_PASS,
				OLD_HOST,
				OLD_PROJECT_ID,
				OLD_DEVICE_ID,
			];
			const BLOCK_SIZE = 512;
			const fakeBytes = new Uint8Array(BLOCK_SIZE);
			const view = new DataView(fakeBytes.buffer);
			view.setUint32(0, 0x0a324655, true); // magic start 0
			view.setUint32(4, 0x9e5d5157, true); // magic start 1
			view.setUint32(8, 0x00002000, true); // flags
			view.setUint32(12, 0x10000000, true); // target address
			view.setUint32(16, 256, true); // payload size
			view.setUint32(20, 0, true); // block number
			view.setUint32(24, 1, true); // total blocks
			view.setUint32(28, 0xe48bff56, true); // family ID (RP2040)
			view.setUint32(BLOCK_SIZE - 4, 0x0ab16f30, true); // magic end
			let payloadOffset = 32;
			for (const part of parts) {
				const encoded = encoder.encode(part);
				fakeBytes.set(encoded, payloadOffset);
				payloadOffset += encoded.length;
			}

			// Use beforeAll so the R2 write persists across all tests in this block
			// (isolatedStorage rolls back writes made inside individual it() calls).
			await env.FIRMWARES.put("devicesdk-pico-w-client.uf2", fakeBytes);
		});

		afterAll(async () => {
			await qb
				.delete({
					tableName: "devices",
					where: {
						conditions: ["id = ?1"],
						params: ["device-fw-test"],
					},
				})
				.execute();
			await qb
				.delete({
					tableName: "devices",
					where: {
						conditions: ["id = ?1"],
						params: ["device-fw-token-test"],
					},
				})
				.execute();
			await env.FIRMWARES.delete("devicesdk-pico-w-client.uf2");
		});

		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/fw-device/firmware",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ device_type: "pico-w" }),
				},
			);

			expect(resp.status).toBe(401);
		});

		it("should return 404 for a non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/non-existent/devices/fw-device/firmware",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ device_type: "pico-w" }),
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 404 for a non-existent device", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/non-existent/firmware",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ device_type: "pico-w" }),
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
		});

		it("should return 404 when firmware is not in storage", async () => {
			// pico2-w firmware was never seeded into R2, so the endpoint should 404
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/fw-device/firmware",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ device_type: "pico2-w" }),
				},
			);

			expect(resp.status).toBe(404);
		});

		it("should accept device_type: esp32c3 and 404 when firmware absent", async () => {
			// The esp32c3 binary is built and uploaded by the firmware-esp32 workflow
			// in CI, not seeded here — so we expect the endpoint to reach the R2 lookup
			// (proving the Zod enum accepts esp32c3) and return 404 because no blob exists.
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/fw-device/firmware",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ device_type: "esp32c3" }),
				},
			);

			expect(resp.status).toBe(404);
			const json = (await resp.json()) as { success: boolean; error: string };
			expect(json.success).toBe(false);
			expect(json.error).toBe("Firmware not found");
		});

		it("should return patched pico-w firmware with correct headers", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/fw-device/firmware",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						device_type: "pico-w",
						ssid: "MyHomeWiFi",
						pass: "s3cr3tpass",
						host: "api.devicesdk.com",
					}),
				},
			);

			expect(resp.status).toBe(200);
			expect(resp.headers.get("Content-Type")).toContain(
				"application/octet-stream",
			);
			expect(resp.headers.get("Content-Disposition")).toContain(
				"devicesdk-client.uf2",
			);

			// Verify the binary was actually patched — placeholder strings must be gone
			const body = await resp.arrayBuffer();
			const text = new TextDecoder().decode(body);
			expect(text).not.toContain(OLD_SSID);
			expect(text).not.toContain(OLD_PASS);
			expect(text).not.toContain(OLD_HOST);
		});

		it("should return 500 JSON error when post-patch UF2 structure is invalid", async () => {
			// Stage a malformed pico-w firmware (placeholder strings present for patching,
			// but not wrapped in a valid UF2 block). Validation must reject and return 500.
			const encoder = new TextEncoder();
			const parts = [
				OLD_TOKEN,
				OLD_SSID,
				OLD_PASS,
				OLD_HOST,
				OLD_PROJECT_ID,
				OLD_DEVICE_ID,
			];
			const totalLen = parts.reduce((s, p) => s + p.length, 0);
			const malformed = new Uint8Array(totalLen);
			let offset = 0;
			for (const part of parts) {
				const encoded = encoder.encode(part);
				malformed.set(encoded, offset);
				offset += encoded.length;
			}
			await env.FIRMWARES.put("devicesdk-pico-w-client.uf2", malformed);

			try {
				const resp = await SELF.fetch(
					"http://localhost/v1/projects/smart-home/devices/fw-device/firmware",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
						},
						body: JSON.stringify({
							device_type: "pico-w",
							ssid: "MyHomeWiFi",
							pass: "s3cr3tpass",
							host: "api.devicesdk.com",
						}),
					},
				);
				expect(resp.status).toBe(500);
				const json = (await resp.json()) as {
					success: boolean;
					error: string;
				};
				expect(json.success).toBe(false);
				expect(json.error).toContain("Firmware validation failed");
			} finally {
				// Restore the valid 1-block UF2 for subsequent tests in this describe block.
				const BLOCK_SIZE = 512;
				const restored = new Uint8Array(BLOCK_SIZE);
				const view = new DataView(restored.buffer);
				view.setUint32(0, 0x0a324655, true);
				view.setUint32(4, 0x9e5d5157, true);
				view.setUint32(8, 0x00002000, true);
				view.setUint32(12, 0x10000000, true);
				view.setUint32(16, 256, true);
				view.setUint32(20, 0, true);
				view.setUint32(24, 1, true);
				view.setUint32(28, 0xe48bff56, true);
				view.setUint32(BLOCK_SIZE - 4, 0x0ab16f30, true);
				let payloadOffset = 32;
				for (const part of parts) {
					const encoded = encoder.encode(part);
					restored.set(encoded, payloadOffset);
					payloadOffset += encoded.length;
				}
				await env.FIRMWARES.put("devicesdk-pico-w-client.uf2", restored);
			}
		});

		it("should create a managed token for the device on first firmware download", async () => {
			// Uses fw-token-device (never downloaded before) so this is genuinely the first
			// download for this device and token creation is triggered here, not by test 5.
			await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/fw-token-device/firmware",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ device_type: "pico-w" }),
				},
			);

			// A managed token scoped to the device should now exist
			const tokenRow = await qb
				.fetchOne<{ description: string; managed: number }>({
					tableName: "tokens",
					where: {
						conditions: ["user_id = ?1", "description = ?2", "managed = ?3"],
						params: [TEST_USER_ID, "fw-token-device authentication token", 1],
					},
				})
				.execute()
				.then((r) => r.results);

			expect(tokenRow).toBeDefined();
			expect(tokenRow?.managed).toBe(1);
		});
	});

	describe("GET /v1/projects/:projectId/devices/:deviceId/status", () => {
		it("should return connected: false for a device that has never connected", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-status-1",
						project_id: project.id,
						device_slug: "status-sensor",
						name: "Status Sensor",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/status-sensor/status",
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
			expect(json.result.connected).toBe(false);
			expect(json.result.connected_since).toBeNull();
			expect(json.result.last_connected_at).toBeNull();
			expect(json.result.current_version_id).toBeNull();
		});

		it("should return last_connected_at and current_version_id from the database", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-status-2",
						project_id: project.id,
						device_slug: "status-sensor-2",
						name: "Status Sensor 2",
						last_connected_at: now - 60000,
						current_version_id: "abc123def456789012345678",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/status-sensor-2/status",
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
			expect(json.result.connected).toBe(false);
			expect(json.result.last_connected_at).toBe(now - 60000);
			expect(json.result.current_version_id).toBe("abc123def456789012345678");
		});

		it("should return 404 for unknown project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/no-such-project/devices/status-sensor/status",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
		});

		it("should return 404 for unknown device", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/no-such-device/status",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
		});

		it("should return 401 without auth token", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/status-sensor/status",
				{
					method: "GET",
				},
			);

			expect(resp.status).toBe(401);
		});
	});

	describe("GET /v1/projects/:projectId/devices/:deviceId/status", () => {
		it("should return connected: false for a device that has never connected", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-status-1",
						project_id: project.id,
						device_slug: "status-sensor",
						name: "Status Sensor",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/status-sensor/status",
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
			expect(json.result.connected).toBe(false);
			expect(json.result.connected_since).toBeNull();
			expect(json.result.last_connected_at).toBeNull();
			expect(json.result.current_version_id).toBeNull();
		});

		it("should return last_connected_at and current_version_id from the database", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-status-2",
						project_id: project.id,
						device_slug: "status-sensor-2",
						name: "Status Sensor 2",
						last_connected_at: now - 60000,
						current_version_id: "abc123def456789012345678",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/status-sensor-2/status",
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
			expect(json.result.connected).toBe(false);
			expect(json.result.last_connected_at).toBe(now - 60000);
			expect(json.result.current_version_id).toBe("abc123def456789012345678");
		});

		it("should return 404 for unknown project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/no-such-project/devices/status-sensor/status",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
		});

		it("should return 404 for unknown device", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/no-such-device/status",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
		});

		it("should return 401 without auth token", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/status-sensor/status",
				{
					method: "GET",
				},
			);

			expect(resp.status).toBe(401);
		});

		it("should return connected: false and null connected_since via DO RPC when no WebSocket is active", async () => {
			// Tests the getConnectionStatus() DO method directly via the DEVICE binding.
			// The connected: true path (with a non-null connected_since) requires an
			// active WebSocket connection which cannot be established in the miniflare
			// test environment — that path is verified by E2E tests.
			const doId = env.DEVICE.idFromName(
				`${TEST_PROJECT_ID}:no-websocket-device`,
			);
			const stub = env.DEVICE.get(doId) as unknown as {
				getConnectionStatus(): Promise<{
					connected: boolean;
					connectedSince: number | null;
				}>;
			};
			const status = await stub.getConnectionStatus();
			expect(status.connected).toBe(false);
			expect(status.connectedSince).toBeNull();
		});
	});

	describe("GET /v1/projects/:projectId/devices/:deviceId/status", () => {
		it("should return connected: false for a device that has never connected", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-status-1",
						project_id: project.id,
						device_slug: "status-sensor",
						name: "Status Sensor",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/status-sensor/status",
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
			expect(json.result.connected).toBe(false);
			expect(json.result.connected_since).toBeNull();
			expect(json.result.last_connected_at).toBeNull();
			expect(json.result.current_version_id).toBeNull();
		});

		it("should return last_connected_at and current_version_id from the database", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-status-2",
						project_id: project.id,
						device_slug: "status-sensor-2",
						name: "Status Sensor 2",
						last_connected_at: now - 60000,
						current_version_id: "abc123def456789012345678",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/status-sensor-2/status",
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
			expect(json.result.connected).toBe(false);
			expect(json.result.last_connected_at).toBe(now - 60000);
			expect(json.result.current_version_id).toBe("abc123def456789012345678");
		});

		it("should return 404 for unknown project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/no-such-project/devices/status-sensor/status",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
		});

		it("should return 404 for unknown device", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/no-such-device/status",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
		});

		it("should return 401 without auth token", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/status-sensor/status",
				{
					method: "GET",
				},
			);

			expect(resp.status).toBe(401);
		});
	});

	describe("POST /v1/projects/:projectId/devices/:deviceId/command", () => {
		it("should return 401 without auth token", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/cmd-sensor/command",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						type: "get_pin_state",
						payload: { pin: 5, mode: "digital" },
					}),
				},
			);

			expect(resp.status).toBe(401);
		});

		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/no-such-project/devices/cmd-sensor/command",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						type: "get_pin_state",
						payload: { pin: 5, mode: "digital" },
					}),
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
			expect(json.error).toContain("Project not found");
		});

		it("should return 404 for non-existent device", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/no-such-device/command",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						type: "get_pin_state",
						payload: { pin: 5, mode: "digital" },
					}),
				},
			);

			expect(resp.status).toBe(404);
			const json = await resp.json();
			expect(json.success).toBe(false);
			expect(json.error).toContain("Device not found");
		});

		it("should return 400 for unknown command type", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-cmd-1",
						project_id: project.id,
						device_slug: "cmd-sensor-1",
						name: "Command Sensor",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/cmd-sensor-1/command",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ type: "unknown_command", payload: {} }),
				},
			);

			expect(resp.status).toBe(400);
		});

		it("should return 503 when device is not connected", async () => {
			const now = Date.now();
			await qb
				.insert<tableDevices>({
					tableName: "devices",
					data: {
						id: "device-cmd-2",
						project_id: project.id,
						device_slug: "cmd-sensor-2",
						name: "Command Sensor 2",
						created_at: now,
						updated_at: now,
					},
				})
				.execute();

			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/cmd-sensor-2/command",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						type: "get_pin_state",
						payload: { pin: 5, mode: "digital" },
					}),
				},
			);

			expect(resp.status).toBe(503);
			const json = await resp.json();
			expect(json.success).toBe(false);
			expect(json.error).toContain("not connected");
		});
	});

	describe("GET /v1/projects/:projectId/devices - pagination", () => {
		it("should return paginated results with default limit", async () => {
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
			expect(json.result.items).toBeDefined();
			expect(Array.isArray(json.result.items)).toBe(true);
			expect(typeof json.result.has_more).toBe("boolean");
			expect(typeof json.result.page).toBe("number");
			expect(typeof json.result.per_page).toBe("number");
		});

		it("should paginate with page/per_page across multiple pages", async () => {
			// Create a dedicated project for pagination tests
			await qb
				.insert<tableProjects>({
					tableName: "projects",
					data: {
						id: "proj-dev-page",
						user_id: TEST_USER_ID,
						project_slug: "dev-pagination",
						created_at: Date.now(),
					},
					onConflict: "IGNORE",
				})
				.execute();

			const baseTime = Date.now() + 100000;
			for (let i = 0; i < 5; i++) {
				await qb
					.insert<tableDevices>({
						tableName: "devices",
						data: {
							id: `dev-page-${i}`,
							project_id: "proj-dev-page",
							device_slug: `page-sensor-${i}`,
							name: `Page Sensor ${i}`,
							created_at: baseTime + i * 1000,
							updated_at: baseTime + i * 1000,
						},
						onConflict: "IGNORE",
					})
					.execute();
			}

			// First page with per_page=2
			const resp1 = await SELF.fetch(
				"http://localhost/v1/projects/dev-pagination/devices?per_page=2",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp1.status).toBe(200);
			const json1 = await resp1.json();
			expect(json1.success).toBe(true);
			expect(json1.result.items.length).toBe(2);
			expect(json1.result.page).toBe(1);
			expect(json1.result.has_more).toBe(true);

			// Second page
			const resp2 = await SELF.fetch(
				"http://localhost/v1/projects/dev-pagination/devices?per_page=2&page=2",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);
			const json2 = await resp2.json();
			expect(json2.success).toBe(true);
			expect(json2.result.items.length).toBe(2);
			expect(json2.result.page).toBe(2);

			// Ensure no overlap between pages
			const page1Ids = json1.result.items.map((d: { id: string }) => d.id);
			const page2Ids = json2.result.items.map((d: { id: string }) => d.id);
			for (const id of page2Ids) {
				expect(page1Ids).not.toContain(id);
			}

			// Last page should have 1 item and has_more=false
			const resp3 = await SELF.fetch(
				"http://localhost/v1/projects/dev-pagination/devices?per_page=2&page=3",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);
			const json3 = await resp3.json();
			expect(json3.success).toBe(true);
			expect(json3.result.items.length).toBe(1);
			expect(json3.result.has_more).toBe(false);
		});
	});
});
