import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer, type TestUser } from "../harness";

let srv: TestServer;
let userA: TestUser;
let projectSlug: string;

beforeAll(async () => {
	srv = await TestServer.start();
	userA = await srv.register({ email: `a-${crypto.randomUUID()}@example.com` });
	const proj = await srv.post("/v1/projects", {
		token: userA.token,
		body: { project_slug: "devs", name: "Devices Project" },
	});
	expect(proj.status).toBe(201);
	projectSlug = "devs";
});

afterAll(() => srv.stop());

function devicesPath(slug = projectSlug) {
	return `/v1/projects/${slug}/devices`;
}

describe("device create", () => {
	test("creates a device (201) with expected shape", async () => {
		const res = await srv.post(devicesPath(), {
			token: userA.token,
			body: {
				device_id: "sensor-one",
				name: "Sensor One",
				description: "desc",
			},
		});
		expect(res.status).toBe(201);
		const body = res.body as {
			success: boolean;
			result: {
				id: string;
				device_id: string;
				name: string | null;
				description: string | null;
				created_at: number;
			};
		};
		expect(body.success).toBe(true);
		expect(body.result.device_id).toBe("sensor-one");
		expect(body.result.name).toBe("Sensor One");
		expect(body.result.description).toBe("desc");
		expect(typeof body.result.id).toBe("string");
		expect(typeof body.result.created_at).toBe("number");
	});

	test("creates a device with only device_id (name/description null)", async () => {
		const res = await srv.post(devicesPath(), {
			token: userA.token,
			body: { device_id: "bare-device" },
		});
		expect(res.status).toBe(201);
		const result = (res.body as { result: { name: null; description: null } })
			.result;
		expect(result.name).toBeNull();
		expect(result.description).toBeNull();
	});

	test("rejects invalid device_id format (400)", async () => {
		// Uppercase + starts with a digit / invalid chars -> 400 from explicit regex check.
		const res = await srv.post(devicesPath(), {
			token: userA.token,
			body: { device_id: "1Invalid_ID" },
		});
		expect(res.status).toBe(400);
		expect((res.body as { success: boolean }).success).toBe(false);
	});

	test("rejects duplicate device_id (409)", async () => {
		const first = await srv.post(devicesPath(), {
			token: userA.token,
			body: { device_id: "dup-device" },
		});
		expect(first.status).toBe(201);
		const dup = await srv.post(devicesPath(), {
			token: userA.token,
			body: { device_id: "dup-device" },
		});
		expect(dup.status).toBe(409);
		expect((dup.body as { error: string }).error).toContain("already exists");
	});

	test("returns 404 when project does not exist", async () => {
		const res = await srv.post(devicesPath("no-such-project"), {
			token: userA.token,
			body: { device_id: "ghost-device" },
		});
		expect(res.status).toBe(404);
		expect((res.body as { error: string }).error).toContain(
			"Project not found",
		);
	});
});

describe("device list", () => {
	test("lists devices (populated, paginated shape)", async () => {
		const res = await srv.get(devicesPath(), { token: userA.token });
		expect(res.status).toBe(200);
		const result = (
			res.body as {
				result: {
					items: Array<{ device_id: string }>;
					page: number;
					per_page: number;
					has_more: boolean;
				};
			}
		).result;
		expect(Array.isArray(result.items)).toBe(true);
		expect(result.items.length).toBeGreaterThan(0);
		expect(result.page).toBe(1);
		expect(result.per_page).toBe(50);
		expect(result.has_more).toBe(false);
		const ids = result.items.map((d) => d.device_id);
		expect(ids).toContain("sensor-one");
	});

	test("respects pagination has_more", async () => {
		const res = await srv.get(devicesPath(), {
			token: userA.token,
			query: { per_page: 1 },
		});
		expect(res.status).toBe(200);
		const result = (
			res.body as { result: { items: unknown[]; has_more: boolean } }
		).result;
		expect(result.items.length).toBe(1);
		expect(result.has_more).toBe(true);
	});

	test("empty list for a project with no devices", async () => {
		await srv.post("/v1/projects", {
			token: userA.token,
			body: { project_slug: "empty", name: "Empty" },
		});
		const res = await srv.get(devicesPath("empty"), { token: userA.token });
		expect(res.status).toBe(200);
		const result = (res.body as { result: { items: unknown[] } }).result;
		expect(result.items.length).toBe(0);
	});

	test("returns 404 listing devices of unknown project", async () => {
		const res = await srv.get(devicesPath("nope"), { token: userA.token });
		expect(res.status).toBe(404);
	});
});

describe("device get", () => {
	test("gets a single device (200) with full shape", async () => {
		const res = await srv.get(`${devicesPath()}/sensor-one`, {
			token: userA.token,
		});
		expect(res.status).toBe(200);
		const result = (
			res.body as {
				result: {
					id: string;
					device_id: string;
					name: string | null;
					current_version_id: string | null;
					last_connected_at: number | null;
					created_at: number;
					updated_at: number;
				};
			}
		).result;
		expect(result.device_id).toBe("sensor-one");
		expect(result.current_version_id).toBeNull();
		expect(result.last_connected_at).toBeNull();
		expect(typeof result.created_at).toBe("number");
		expect(typeof result.updated_at).toBe("number");
	});

	test("returns 404 for unknown device", async () => {
		const res = await srv.get(`${devicesPath()}/missing-device`, {
			token: userA.token,
		});
		expect(res.status).toBe(404);
		expect((res.body as { error: string }).error).toContain("Device not found");
	});

	test("returns 404 for device in unknown project", async () => {
		const res = await srv.get(`${devicesPath("nope")}/sensor-one`, {
			token: userA.token,
		});
		expect(res.status).toBe(404);
		expect((res.body as { error: string }).error).toContain(
			"Project not found",
		);
	});
});

describe("device update", () => {
	test("updates name + description (200)", async () => {
		const res = await srv.put(`${devicesPath()}/sensor-one`, {
			token: userA.token,
			body: { name: "Renamed", description: "new desc" },
		});
		expect(res.status).toBe(200);
		const result = (
			res.body as {
				result: {
					name: string | null;
					description: string | null;
					updated_at: number;
				};
			}
		).result;
		expect(result.name).toBe("Renamed");
		expect(result.description).toBe("new desc");
		expect(typeof result.updated_at).toBe("number");

		// Persisted: GET reflects the change.
		const after = await srv.get(`${devicesPath()}/sensor-one`, {
			token: userA.token,
		});
		expect((after.body as { result: { name: string } }).result.name).toBe(
			"Renamed",
		);
	});

	test("clears a field with empty string (-> null)", async () => {
		const res = await srv.put(`${devicesPath()}/sensor-one`, {
			token: userA.token,
			body: { description: "" },
		});
		expect(res.status).toBe(200);
		expect(
			(res.body as { result: { description: string | null } }).result
				.description,
		).toBeNull();
	});

	test("returns 404 updating unknown device", async () => {
		const res = await srv.put(`${devicesPath()}/missing-device`, {
			token: userA.token,
			body: { name: "x" },
		});
		expect(res.status).toBe(404);
	});
});

describe("device status (offline)", () => {
	test("reports connected:false for an offline device with full shape", async () => {
		const res = await srv.get(`${devicesPath()}/sensor-one/status`, {
			token: userA.token,
		});
		expect(res.status).toBe(200);
		const result = (
			res.body as {
				result: {
					connected: boolean;
					connected_since: number | null;
					last_connected_at: number | null;
					current_version_id: string | null;
				};
			}
		).result;
		expect(result.connected).toBe(false);
		expect(result.connected_since).toBeNull();
		expect(result.last_connected_at).toBeNull();
		expect(result.current_version_id).toBeNull();
	});

	test("returns 404 for status of unknown device", async () => {
		const res = await srv.get(`${devicesPath()}/missing-device/status`, {
			token: userA.token,
		});
		expect(res.status).toBe(404);
	});

	test("returns 404 for status in unknown project", async () => {
		const res = await srv.get(`${devicesPath("nope")}/sensor-one/status`, {
			token: userA.token,
		});
		expect(res.status).toBe(404);
	});
});

describe("device delete", () => {
	test("deletes a device (200) and it is then gone (404)", async () => {
		const create = await srv.post(devicesPath(), {
			token: userA.token,
			body: { device_id: "to-delete" },
		});
		expect(create.status).toBe(201);

		const del = await srv.delete(`${devicesPath()}/to-delete`, {
			token: userA.token,
		});
		expect(del.status).toBe(200);
		const result = (
			del.body as { result: { deleted: boolean; device_id: string } }
		).result;
		expect(result.deleted).toBe(true);
		expect(result.device_id).toBe("to-delete");

		const get = await srv.get(`${devicesPath()}/to-delete`, {
			token: userA.token,
		});
		expect(get.status).toBe(404);
	});

	test("returns 404 deleting unknown device", async () => {
		const res = await srv.delete(`${devicesPath()}/missing-device`, {
			token: userA.token,
		});
		expect(res.status).toBe(404);
	});
});

describe("cross-user isolation", () => {
	test("user B cannot see or mutate user A's project/device", async () => {
		const userB = await srv.register({
			email: `b-${crypto.randomUUID()}@example.com`,
		});

		// User B sees A's project slug as a non-existent project (scoped by user_id).
		const list = await srv.get(devicesPath(), { token: userB.token });
		expect(list.status).toBe(404);

		const get = await srv.get(`${devicesPath()}/sensor-one`, {
			token: userB.token,
		});
		expect(get.status).toBe(404);

		const update = await srv.put(`${devicesPath()}/sensor-one`, {
			token: userB.token,
			body: { name: "hijack" },
		});
		expect(update.status).toBe(404);

		const del = await srv.delete(`${devicesPath()}/sensor-one`, {
			token: userB.token,
		});
		expect(del.status).toBe(404);

		const status = await srv.get(`${devicesPath()}/sensor-one/status`, {
			token: userB.token,
		});
		expect(status.status).toBe(404);

		// And A's device is still intact.
		const stillThere = await srv.get(`${devicesPath()}/sensor-one`, {
			token: userA.token,
		});
		expect(stillThere.status).toBe(200);
	});

	test("unauthenticated requests are rejected", async () => {
		const res = await srv.get(devicesPath());
		expect(res.status).toBe(401);
	});
});
