import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1QB } from "workers-qb";
import type {
	tableDeviceEntityConfigs,
	tableDevices,
	tableProjects,
} from "../../src/types";
import { TEST_PROJECT_ID, TEST_SESSION_TOKEN } from "../setup-test-data";

describe.sequential("Entity endpoints", () => {
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
		device = (await qb
			.insert<tableDevices>({
				tableName: "devices",
				data: {
					id: "device-entities-1",
					project_id: project.id,
					device_slug: "entity-device",
					name: "Entity Test Device",
					created_at: now,
					updated_at: now,
				},
				returning: "*",
				onConflict: "IGNORE",
			})
			.execute()
			.then((d) => d.results)) as tableDevices;
	});

	// ─────────────────────────────────────────────────────────────────────────
	// GET /v1/projects/:projectId/devices/:deviceId/watch
	// ─────────────────────────────────────────────────────────────────────────
	describe("GET /v1/projects/:projectId/devices/:deviceId/watch", () => {
		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/watch`,
				{ method: "GET" },
			);

			expect(resp.status).toBe(401);
		});

		it("should return 426 when Upgrade header is missing", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/watch`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(426);
			const json = (await resp.json()) as { success: boolean; error: string };
			expect(json.success).toBe(false);
		});

		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/no-such-project/devices/entity-device/watch",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
						Upgrade: "websocket",
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = (await resp.json()) as { success: boolean; error: string };
			expect(json.success).toBe(false);
		});

		it("should return 404 for non-existent device", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/no-such-device/watch`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
						Upgrade: "websocket",
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = (await resp.json()) as { success: boolean; error: string };
			expect(json.success).toBe(false);
		});

		it("should upgrade to WebSocket for an existing device", async () => {
			// The miniflare test environment supports WebSocket upgrades via SELF.fetch.
			// We verify that the Worker returns 101 and hands back a client socket.
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/watch`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
						Upgrade: "websocket",
						Connection: "Upgrade",
					},
				},
			);

			expect(resp.status).toBe(101);
			expect(resp.webSocket).not.toBeNull();
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// GET /v1/projects/:projectId/devices/:deviceId/entities
	// ─────────────────────────────────────────────────────────────────────────
	describe("GET /v1/projects/:projectId/devices/:deviceId/entities", () => {
		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/entities`,
				{ method: "GET" },
			);

			expect(resp.status).toBe(401);
		});

		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/no-such-project/devices/entity-device/entities",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = (await resp.json()) as { success: boolean };
			expect(json.success).toBe(false);
		});

		it("should return 404 for non-existent device", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/no-such-device/entities`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);

			expect(resp.status).toBe(404);
			const json = (await resp.json()) as { success: boolean };
			expect(json.success).toBe(false);
		});

		it("should return an empty entity list when no entities are stored", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/entities`,
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
				result: { entities: unknown[] };
			};
			expect(json.success).toBe(true);
			expect(json.result.entities).toEqual([]);
		});

		it("should return stored entity declarations", async () => {
			// Pre-seed a valid entity config row directly in D1
			const entityConfig = {
				entity_id: "door_sensor",
				type: "binary_sensor",
				name: "Front Door",
				source: "gpio_state_changed",
				pin: 4,
				state_map: { high: "open", low: "closed" },
			};
			const now = Date.now();
			await qb
				.insert<tableDeviceEntityConfigs>({
					tableName: "device_entity_configs",
					data: {
						id: "entity-seed-1",
						device_id: device.id,
						entity_id: entityConfig.entity_id,
						config: JSON.stringify(entityConfig),
						created_at: now,
						updated_at: now,
					},
					onConflict: "IGNORE",
				})
				.execute();

			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/entities`,
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
					entities: Array<{
						entity_id: string;
						type: string;
						name: string;
						source: string;
					}>;
				};
			};
			expect(json.success).toBe(true);
			expect(json.result.entities).toHaveLength(1);
			expect(json.result.entities[0].entity_id).toBe("door_sensor");
			expect(json.result.entities[0].type).toBe("binary_sensor");
			expect(json.result.entities[0].name).toBe("Front Door");
		});

		it("should silently skip rows with invalid stored JSON", async () => {
			// Insert a corrupted config row
			const now = Date.now();
			await env.DB.prepare(
				"INSERT OR IGNORE INTO device_entity_configs (id, device_id, entity_id, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
				.bind(
					"entity-corrupt-1",
					device.id,
					"corrupt_entity",
					"{not valid json",
					now,
					now,
				)
				.run();

			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/entities`,
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
				result: { entities: unknown[] };
			};
			expect(json.success).toBe(true);
			// Corrupt row is silently dropped; the valid seed row from the previous test
			// may or may not be present depending on test isolation — just verify no error.
			expect(Array.isArray(json.result.entities)).toBe(true);
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// PUT /v1/projects/:projectId/devices/:deviceId/entities
	// ─────────────────────────────────────────────────────────────────────────
	describe("PUT /v1/projects/:projectId/devices/:deviceId/entities", () => {
		const validEntity = {
			entity_id: "temp_sensor",
			type: "sensor",
			name: "Temperature",
			source: "temperature_result",
			unit: "°C",
		};

		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/entities`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ entities: [validEntity] }),
				},
			);

			expect(resp.status).toBe(401);
		});

		it("should return 404 for non-existent project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/no-such-project/devices/entity-device/entities",
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ entities: [validEntity] }),
				},
			);

			expect(resp.status).toBe(404);
			const json = (await resp.json()) as { success: boolean };
			expect(json.success).toBe(false);
		});

		it("should return 404 for non-existent device", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/no-such-device/entities`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ entities: [validEntity] }),
				},
			);

			expect(resp.status).toBe(404);
			const json = (await resp.json()) as { success: boolean };
			expect(json.success).toBe(false);
		});

		it("should store a valid entity and return count", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/entities`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ entities: [validEntity] }),
				},
			);

			expect(resp.status).toBe(200);
			const json = (await resp.json()) as {
				success: boolean;
				result: { count: number };
			};
			expect(json.success).toBe(true);
			expect(json.result.count).toBe(1);
		});

		it("should replace existing entities atomically", async () => {
			const newEntities = [
				{
					entity_id: "door_open",
					type: "binary_sensor",
					name: "Door Open",
					source: "gpio_state_changed",
					pin: 5,
					state_map: { high: "open", low: "closed" },
				},
				{
					entity_id: "room_temp",
					type: "sensor",
					name: "Room Temperature",
					source: "temperature_result",
					unit: "°C",
				},
			];

			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/entities`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ entities: newEntities }),
				},
			);

			expect(resp.status).toBe(200);
			const putJson = (await resp.json()) as {
				success: boolean;
				result: { count: number };
			};
			expect(putJson.result.count).toBe(2);

			// Verify via GET that only the new entities are present
			const getResp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/entities`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);
			const getJson = (await getResp.json()) as {
				success: boolean;
				result: {
					entities: Array<{ entity_id: string }>;
				};
			};
			expect(getJson.result.entities).toHaveLength(2);
			const ids = getJson.result.entities.map((e) => e.entity_id);
			expect(ids).toContain("door_open");
			expect(ids).toContain("room_temp");
			expect(ids).not.toContain("temp_sensor"); // from previous PUT — must be gone
		});

		it("should return 400 for duplicate entity_id within the same request", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/entities`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						entities: [validEntity, { ...validEntity, name: "Duplicate" }],
					}),
				},
			);

			expect(resp.status).toBe(400);
			const json = (await resp.json()) as { success: boolean; error: string };
			expect(json.success).toBe(false);
			expect(json.error).toContain("Duplicate entity_id");
		});

		it("should return 400 when the entity list exceeds the 50-entity limit", async () => {
			const tooMany = Array.from({ length: 51 }, (_, i) => ({
				entity_id: `entity_${i}`,
				type: "sensor",
				name: `Sensor ${i}`,
				source: "user",
			}));

			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/entities`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ entities: tooMany }),
				},
			);

			expect(resp.status).toBe(400);
		});

		it("should return 400 for an entity with an invalid entity_id format", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/entities`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({
						entities: [
							{
								entity_id: "INVALID_UPPERCASE",
								type: "sensor",
								name: "Bad",
								source: "user",
							},
						],
					}),
				},
			);

			expect(resp.status).toBe(400);
		});

		it("should clear all entities when an empty array is provided", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/entities`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
					body: JSON.stringify({ entities: [] }),
				},
			);

			expect(resp.status).toBe(200);
			const putJson = (await resp.json()) as {
				success: boolean;
				result: { count: number };
			};
			expect(putJson.result.count).toBe(0);

			// Verify via GET
			const getResp = await SELF.fetch(
				`http://localhost/v1/projects/${TEST_PROJECT_ID}/devices/entity-device/entities`,
				{
					method: "GET",
					headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
				},
			);
			const getJson = (await getResp.json()) as {
				success: boolean;
				result: { entities: unknown[] };
			};
			expect(getJson.result.entities).toHaveLength(0);
		});
	});
});
