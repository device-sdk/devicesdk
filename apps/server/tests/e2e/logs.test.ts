import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer } from "../harness";

// NOTE: GET /v1/projects/:projectId/devices/:deviceId/logs is **deprecated**
// (see src/endpoints/logs/listLogs.ts). It now always returns 410 Gone with a
// `Link` header pointing at the watcher WebSocket and performs NO database
// lookups — clients migrate to `/watch?backfillLimit=N`. These tests pin that
// contract so a future "un-deprecation" can't silently regress callers.

let srv: TestServer;

beforeAll(async () => {
	srv = await TestServer.start();
});

afterAll(() => srv.stop());

interface DeprecatedBody {
	success: false;
	error: string;
	code: "LOGS_DEPRECATED";
}

describe("deprecated logs endpoint", () => {
	test("returns 410 Gone with the LOGS_DEPRECATED code and Link header", async () => {
		const { auth, projectSlug, deviceSlug } = await srv.scaffold({
			projectSlug: "logs-gone",
			deviceSlug: "dev",
		});
		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/logs`,
			{ token: auth.token },
		);
		expect(res.status).toBe(410);
		const body = res.body as DeprecatedBody;
		expect(body.success).toBe(false);
		expect(body.code).toBe("LOGS_DEPRECATED");
		expect(body.error).toContain("watcher WebSocket");

		const link = res.headers.get("Link");
		expect(link).toBeTruthy();
		expect(link).toContain(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/watch`,
		);
		expect(link).toContain('rel="alternate"');
	});

	test("410 is returned even when device_logs rows exist (no DB lookup)", async () => {
		const { auth, projectSlug, deviceSlug, deviceId } = await srv.scaffold({
			projectSlug: "logs-rows",
			deviceSlug: "dev",
		});
		// Seed real rows; the deprecated endpoint must ignore them entirely.
		const now = Date.now();
		for (let i = 0; i < 3; i++) {
			srv.db
				.query(
					"INSERT INTO device_logs (id, device_id, level, message, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
				)
				.run(crypto.randomUUID(), deviceId, "info", `message ${i}`, now + i);
		}
		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/logs`,
			{ token: auth.token },
		);
		expect(res.status).toBe(410);
		expect((res.body as DeprecatedBody).code).toBe("LOGS_DEPRECATED");
	});

	test("query params (limit/level/cursor) are accepted but still 410", async () => {
		const { auth, projectSlug, deviceSlug } = await srv.scaffold({
			projectSlug: "logs-query",
			deviceSlug: "dev",
		});
		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/logs`,
			{
				token: auth.token,
				query: { limit: 25, level: "error", cursor: "abc" },
			},
		);
		expect(res.status).toBe(410);
		expect((res.body as DeprecatedBody).code).toBe("LOGS_DEPRECATED");
	});

	test("invalid query params are rejected by validation before the 410", async () => {
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
