import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer } from "../harness";

let srv: TestServer;

beforeAll(async () => {
	srv = await TestServer.start();
});

afterAll(() => srv.stop());

interface LogsBody {
	success: true;
	result: {
		logs: { id: string; level: string; message: string; created_at: number }[];
		cursor: string | null;
	};
}

function seedLogs(
	deviceId: string,
	entries: { level: string; message: string; created_at: number }[],
) {
	for (const entry of entries) {
		srv.db
			.query(
				"INSERT INTO device_logs (id, device_id, level, message, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
			)
			.run(
				crypto.randomUUID(),
				deviceId,
				entry.level,
				entry.message,
				entry.created_at,
			);
	}
}

describe("logs endpoint", () => {
	test("returns an empty page when no logs exist", async () => {
		const { auth, projectSlug, deviceSlug } = await srv.scaffold({
			projectSlug: "logs-empty",
			deviceSlug: "dev",
		});
		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/logs`,
			{ token: auth.token },
		);
		expect(res.status).toBe(200);
		const body = res.body as LogsBody;
		expect(body.success).toBe(true);
		expect(body.result.logs).toEqual([]);
		expect(body.result.cursor).toBeNull();
	});

	test("returns rows newest first", async () => {
		const { auth, projectSlug, deviceSlug, deviceId } = await srv.scaffold({
			projectSlug: "logs-order",
			deviceSlug: "dev",
		});
		const now = Date.now();
		seedLogs(deviceId, [
			{ level: "info", message: "first", created_at: now },
			{ level: "info", message: "second", created_at: now + 1 },
			{ level: "info", message: "third", created_at: now + 2 },
		]);

		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/logs`,
			{ token: auth.token },
		);
		expect(res.status).toBe(200);
		const body = res.body as LogsBody;
		expect(body.result.logs.map((l) => l.message)).toEqual([
			"third",
			"second",
			"first",
		]);
		expect(body.result.cursor).toBeNull();
	});

	test("filters by level", async () => {
		const { auth, projectSlug, deviceSlug, deviceId } = await srv.scaffold({
			projectSlug: "logs-level",
			deviceSlug: "dev",
		});
		const now = Date.now();
		seedLogs(deviceId, [
			{ level: "info", message: "info-1", created_at: now },
			{ level: "error", message: "error-1", created_at: now + 1 },
			{ level: "info", message: "info-2", created_at: now + 2 },
		]);

		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/logs`,
			{ token: auth.token, query: { level: "error" } },
		);
		expect(res.status).toBe(200);
		const body = res.body as LogsBody;
		expect(body.result.logs).toHaveLength(1);
		expect(body.result.logs[0]?.message).toBe("error-1");
	});

	test("paginates with a cursor", async () => {
		const { auth, projectSlug, deviceSlug, deviceId } = await srv.scaffold({
			projectSlug: "logs-cursor",
			deviceSlug: "dev",
		});
		const now = Date.now();
		seedLogs(
			deviceId,
			Array.from({ length: 5 }, (_, i) => ({
				level: "info",
				message: `msg-${i}`,
				created_at: now + i,
			})),
		);

		const page1 = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/logs`,
			{ token: auth.token, query: { limit: 2 } },
		);
		expect(page1.status).toBe(200);
		const body1 = page1.body as LogsBody;
		expect(body1.result.logs.map((l) => l.message)).toEqual(["msg-4", "msg-3"]);
		expect(body1.result.cursor).toBeTruthy();

		const page2 = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/logs`,
			{
				token: auth.token,
				query: { limit: 2, cursor: body1.result.cursor as string },
			},
		);
		expect(page2.status).toBe(200);
		const body2 = page2.body as LogsBody;
		expect(body2.result.logs.map((l) => l.message)).toEqual(["msg-2", "msg-1"]);
		expect(body2.result.cursor).toBeTruthy();

		const page3 = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/logs`,
			{
				token: auth.token,
				query: { limit: 2, cursor: body2.result.cursor as string },
			},
		);
		expect(page3.status).toBe(200);
		const body3 = page3.body as LogsBody;
		expect(body3.result.logs.map((l) => l.message)).toEqual(["msg-0"]);
		expect(body3.result.cursor).toBeNull();
	});

	test("rejects a malformed cursor with 400", async () => {
		const { auth, projectSlug, deviceSlug } = await srv.scaffold({
			projectSlug: "logs-bad-cursor",
			deviceSlug: "dev",
		});
		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/logs`,
			{ token: auth.token, query: { cursor: "not-a-cursor" } },
		);
		expect(res.status).toBe(400);
	});

	test("invalid query params are rejected by validation", async () => {
		const { auth, projectSlug, deviceSlug } = await srv.scaffold({
			projectSlug: "logs-bad",
			deviceSlug: "dev",
		});
		// limit max is 100; level must be one of the enum values.
		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/logs`,
			{ token: auth.token, query: { limit: 9999, level: "bogus" } },
		);
		expect(res.status).toBe(400);
	});

	test("404s for a device outside the caller's project", async () => {
		const { auth, projectSlug } = await srv.scaffold({
			projectSlug: "logs-404",
			deviceSlug: "dev",
		});
		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/does-not-exist/logs`,
			{ token: auth.token },
		);
		expect(res.status).toBe(404);
	});

	test("unauthenticated request is rejected before reaching the handler", async () => {
		const { projectSlug, deviceSlug } = await srv.scaffold({
			projectSlug: "logs-unauth",
			deviceSlug: "dev",
		});
		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/logs`,
		);
		expect(res.status).toBe(401);
	});
});
