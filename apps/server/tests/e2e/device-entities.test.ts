import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer, type TestUser } from "../harness";

let srv: TestServer;
let auth: TestUser;
let projectSlug: string;
let deviceSlug: string;

beforeAll(async () => {
	srv = await TestServer.start();
	const s = await srv.scaffold({ projectSlug: "ents", deviceSlug: "edev" });
	auth = s.auth;
	projectSlug = s.projectSlug;
	deviceSlug = s.deviceSlug;
});

afterAll(() => srv.stop());

function entitiesPath(p = projectSlug, d = deviceSlug) {
	return `/v1/projects/${p}/devices/${d}/entities`;
}

const sensorEntity = {
	entity_id: "temperature",
	type: "sensor",
	name: "Temperature",
	device_class: "temperature",
	unit: "°C",
	source: "temperature_result",
};

const switchEntity = {
	entity_id: "relay",
	type: "switch",
	name: "Relay",
	source: "user",
	pin: 12,
};

describe("get entities (empty)", () => {
	test("returns an empty array when no entities exist", async () => {
		const res = await srv.get(entitiesPath(), { token: auth.token });
		expect(res.status).toBe(200);
		const result = (res.body as { result: { entities: unknown[] } }).result;
		expect(result.entities).toEqual([]);
	});
});

describe("upsert + get entities", () => {
	test("upserts a valid set (200) and GET returns them", async () => {
		const put = await srv.put(entitiesPath(), {
			token: auth.token,
			body: { entities: [sensorEntity, switchEntity] },
		});
		expect(put.status).toBe(200);
		expect((put.body as { result: { count: number } }).result.count).toBe(2);

		const get = await srv.get(entitiesPath(), { token: auth.token });
		expect(get.status).toBe(200);
		const entities = (
			get.body as { result: { entities: Array<{ entity_id: string }> } }
		).result.entities;
		expect(entities.length).toBe(2);
		const ids = entities.map((e) => e.entity_id).sort();
		expect(ids).toEqual(["relay", "temperature"]);
		// Round-trips full config.
		const temp = entities.find((e) => e.entity_id === "temperature") as Record<
			string,
			unknown
		>;
		expect(temp.unit).toBe("°C");
		expect(temp.type).toBe("sensor");
	});

	test("replaces existing entities (PUT is a full replace)", async () => {
		const replacement = {
			entity_id: "led",
			type: "light",
			name: "LED",
			source: "user",
			light_type: "pwm",
			pwm_frequency: 1000,
		};
		const put = await srv.put(entitiesPath(), {
			token: auth.token,
			body: { entities: [replacement] },
		});
		expect(put.status).toBe(200);
		expect((put.body as { result: { count: number } }).result.count).toBe(1);

		const get = await srv.get(entitiesPath(), { token: auth.token });
		const entities = (
			get.body as { result: { entities: Array<{ entity_id: string }> } }
		).result.entities;
		expect(entities.length).toBe(1);
		expect(entities[0].entity_id).toBe("led");
	});

	test("empty entities array clears all (count 0)", async () => {
		const put = await srv.put(entitiesPath(), {
			token: auth.token,
			body: { entities: [] },
		});
		expect(put.status).toBe(200);
		expect((put.body as { result: { count: number } }).result.count).toBe(0);

		const get = await srv.get(entitiesPath(), { token: auth.token });
		expect(
			(get.body as { result: { entities: unknown[] } }).result.entities.length,
		).toBe(0);
	});
});

describe("upsert validation", () => {
	test("rejects duplicate entity_id in request (400)", async () => {
		const res = await srv.put(entitiesPath(), {
			token: auth.token,
			body: {
				entities: [sensorEntity, { ...switchEntity, entity_id: "temperature" }],
			},
		});
		expect(res.status).toBe(400);
		expect((res.body as { error: string }).error).toContain("Duplicate");
	});

	test("rejects invalid entity_id format (400 from zod)", async () => {
		const res = await srv.put(entitiesPath(), {
			token: auth.token,
			body: {
				entities: [{ ...sensorEntity, entity_id: "Invalid-ID" }],
			},
		});
		expect(res.status).toBe(400);
	});

	test("rejects unknown entity type (400 from zod)", async () => {
		const res = await srv.put(entitiesPath(), {
			token: auth.token,
			body: { entities: [{ ...sensorEntity, type: "thermostat" }] },
		});
		expect(res.status).toBe(400);
	});

	test("rejects missing required fields (400 from zod)", async () => {
		const res = await srv.put(entitiesPath(), {
			token: auth.token,
			body: { entities: [{ entity_id: "x", type: "sensor" }] },
		});
		expect(res.status).toBe(400);
	});
});

describe("entities not-found", () => {
	test("GET 404 for unknown device", async () => {
		const res = await srv.get(entitiesPath(projectSlug, "ghost"), {
			token: auth.token,
		});
		expect(res.status).toBe(404);
		expect((res.body as { error: string }).error).toContain("Device not found");
	});

	test("GET 404 for unknown project", async () => {
		const res = await srv.get(entitiesPath("ghostproj", deviceSlug), {
			token: auth.token,
		});
		expect(res.status).toBe(404);
		expect((res.body as { error: string }).error).toContain(
			"Project not found",
		);
	});

	test("PUT 404 for unknown device", async () => {
		const res = await srv.put(entitiesPath(projectSlug, "ghost"), {
			token: auth.token,
			body: { entities: [sensorEntity] },
		});
		expect(res.status).toBe(404);
	});

	test("PUT 404 for unknown project", async () => {
		const res = await srv.put(entitiesPath("ghostproj", deviceSlug), {
			token: auth.token,
			body: { entities: [sensorEntity] },
		});
		expect(res.status).toBe(404);
	});
});

describe("entities cross-user isolation", () => {
	test("user B gets 404 on user A's device entities", async () => {
		const userB = await srv.register({
			email: `eb-${crypto.randomUUID()}@example.com`,
		});
		const get = await srv.get(entitiesPath(), { token: userB.token });
		expect(get.status).toBe(404);
		const put = await srv.put(entitiesPath(), {
			token: userB.token,
			body: { entities: [sensorEntity] },
		});
		expect(put.status).toBe(404);
	});
});
