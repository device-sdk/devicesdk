import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { recordDeviceUsage } from "../../src/foundation/usageMetrics";
import { TestServer } from "../harness";

let srv: TestServer;

beforeAll(async () => {
	srv = await TestServer.start();
});

afterAll(() => srv.stop());

interface MetricsResult {
	window: string;
	bucket_seconds: number;
	series: Array<{
		ts: number;
		messages_in: number;
		messages_out: number;
		bytes_in: number;
		bytes_out: number;
		cron_fires: number;
		connected_seconds: number;
	}>;
	totals: {
		messages_in: number;
		messages_out: number;
		bytes_in: number;
		bytes_out: number;
		cron_fires: number;
		connected_seconds: number;
	};
}

/**
 * Seed a usage bucket directly with an explicit bucket_ts (epoch ms). The
 * `recordDeviceUsage` helper always writes to the *current* bucket, so for
 * window tests that need older buckets we insert rows by hand against the
 * same schema.
 */
function seedBucket(
	srv: TestServer,
	deviceId: string,
	projectId: string,
	bucketTs: number,
	totals: Partial<{
		messages_in: number;
		messages_out: number;
		bytes_in: number;
		bytes_out: number;
		cron_fires: number;
		connected_seconds: number;
	}>,
): void {
	srv.db
		.query(
			`INSERT INTO device_usage (device_id, project_id, bucket_ts, messages_in, messages_out, bytes_in, bytes_out, cron_fires, connected_seconds)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
		)
		.run(
			deviceId,
			projectId,
			bucketTs,
			totals.messages_in ?? 0,
			totals.messages_out ?? 0,
			totals.bytes_in ?? 0,
			totals.bytes_out ?? 0,
			totals.cron_fires ?? 0,
			totals.connected_seconds ?? 0,
		);
}

/** Align a timestamp down to the 5-minute storage bucket. */
function alignBucket(ts: number): number {
	return Math.floor(ts / 300_000) * 300_000;
}

describe("device metrics endpoint", () => {
	test("empty metrics return zero totals and an empty series", async () => {
		const { auth, projectSlug, deviceSlug } = await srv.scaffold({
			projectSlug: "m-empty",
			deviceSlug: "dev",
		});
		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/metrics`,
			{ token: auth.token },
		);
		expect(res.status).toBe(200);
		const r = (res.body as { result: MetricsResult }).result;
		expect(r.window).toBe("1h");
		expect(r.bucket_seconds).toBe(300);
		expect(r.series).toEqual([]);
		expect(r.totals).toEqual({
			messages_in: 0,
			messages_out: 0,
			bytes_in: 0,
			bytes_out: 0,
			cron_fires: 0,
			connected_seconds: 0,
		});
	});

	test("recordDeviceUsage rows surface in the 1h window totals", async () => {
		const { auth, projectSlug, deviceSlug, projectId, deviceId } =
			await srv.scaffold({ projectSlug: "m-record", deviceSlug: "dev" });

		// Two deltas in the current 5-minute bucket → upsert accumulates them.
		recordDeviceUsage(srv.db, {
			deviceId,
			projectId,
			messagesIn: 3,
			messagesOut: 1,
			bytesIn: 100,
			bytesOut: 50,
			cronFires: 2,
			connectedSeconds: 10,
		});
		recordDeviceUsage(srv.db, {
			deviceId,
			projectId,
			messagesIn: 2,
			bytesIn: 25,
		});

		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/metrics`,
			{ token: auth.token, query: { window: "1h" } },
		);
		expect(res.status).toBe(200);
		const r = (res.body as { result: MetricsResult }).result;
		expect(r.totals.messages_in).toBe(5);
		expect(r.totals.messages_out).toBe(1);
		expect(r.totals.bytes_in).toBe(125);
		expect(r.totals.bytes_out).toBe(50);
		expect(r.totals.cron_fires).toBe(2);
		expect(r.totals.connected_seconds).toBe(10);
		// A single accumulated bucket.
		expect(r.series.length).toBe(1);
		expect(r.series[0].messages_in).toBe(5);
	});

	test("window selection controls look-back span and bucket width", async () => {
		const { auth, projectSlug, deviceSlug, projectId, deviceId } =
			await srv.scaffold({ projectSlug: "m-window", deviceSlug: "dev" });
		const now = Date.now();

		// recent (within 1h), mid (within 12h but outside 1h), old (within 7d
		// but outside 12h).
		seedBucket(srv, deviceId, projectId, alignBucket(now - 5 * 60_000), {
			messages_in: 10,
		});
		seedBucket(srv, deviceId, projectId, alignBucket(now - 3 * 3600_000), {
			messages_in: 20,
		});
		seedBucket(srv, deviceId, projectId, alignBucket(now - 3 * 24 * 3600_000), {
			messages_in: 40,
		});

		const h1 = (
			(
				await srv.get(
					`/v1/projects/${projectSlug}/devices/${deviceSlug}/metrics`,
					{ token: auth.token, query: { window: "1h" } },
				)
			).body as { result: MetricsResult }
		).result;
		expect(h1.bucket_seconds).toBe(300);
		expect(h1.totals.messages_in).toBe(10);

		const h12 = (
			(
				await srv.get(
					`/v1/projects/${projectSlug}/devices/${deviceSlug}/metrics`,
					{ token: auth.token, query: { window: "12h" } },
				)
			).body as { result: MetricsResult }
		).result;
		expect(h12.bucket_seconds).toBe(1800);
		expect(h12.totals.messages_in).toBe(30); // recent + mid

		const d7 = (
			(
				await srv.get(
					`/v1/projects/${projectSlug}/devices/${deviceSlug}/metrics`,
					{ token: auth.token, query: { window: "7d" } },
				)
			).body as { result: MetricsResult }
		).result;
		expect(d7.bucket_seconds).toBe(21600);
		expect(d7.totals.messages_in).toBe(70); // all three
	});

	test("unknown device returns 404", async () => {
		const { auth, projectSlug } = await srv.scaffold({
			projectSlug: "m-404",
			deviceSlug: "dev",
		});
		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/nope/metrics`,
			{ token: auth.token },
		);
		expect(res.status).toBe(404);
		expect((res.body as { success: boolean }).success).toBe(false);
	});

	test("unauthenticated request is rejected", async () => {
		const { projectSlug, deviceSlug } = await srv.scaffold({
			projectSlug: "m-unauth",
			deviceSlug: "dev",
		});
		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/metrics`,
		);
		expect(res.status).toBe(401);
	});

	test("cross-user access is a 404 (project scoped to owner)", async () => {
		const { projectSlug, deviceSlug } = await srv.scaffold({
			projectSlug: "m-cross",
			deviceSlug: "dev",
		});
		const other = await srv.register({
			email: `other-${crypto.randomUUID()}@example.com`,
		});
		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/metrics`,
			{ token: other.token },
		);
		expect(res.status).toBe(404);
	});
});

describe("project metrics endpoint", () => {
	test("aggregates per-device series and project totals", async () => {
		const { auth, projectSlug, projectId, deviceId, deviceSlug } =
			await srv.scaffold({ projectSlug: "pm-agg", deviceSlug: "dev-a" });

		// Add a second device under the same project.
		const devB = await srv.post(`/v1/projects/${projectSlug}/devices`, {
			token: auth.token,
			body: { device_id: "dev-b", name: "Device B" },
		});
		expect(devB.status).toBe(201);
		const deviceBId = (devB.body as { result: { id: string } }).result.id;

		const now = Date.now();
		seedBucket(srv, deviceId, projectId, alignBucket(now - 60_000), {
			messages_in: 7,
		});
		seedBucket(srv, deviceBId, projectId, alignBucket(now - 60_000), {
			messages_in: 5,
			cron_fires: 4,
		});

		const res = await srv.get(`/v1/projects/${projectSlug}/metrics`, {
			token: auth.token,
			query: { window: "1h" },
		});
		expect(res.status).toBe(200);
		const r = (
			res.body as {
				result: {
					window: string;
					bucket_seconds: number;
					devices: Array<{
						device_id: string;
						name: string | null;
						totals: { messages_in: number; cron_fires: number };
					}>;
					totals: { messages_in: number; cron_fires: number };
				};
			}
		).result;

		expect(r.window).toBe("1h");
		expect(r.totals.messages_in).toBe(12);
		expect(r.totals.cron_fires).toBe(4);

		const byId = new Map(r.devices.map((d) => [d.device_id, d]));
		expect(byId.get(deviceSlug)?.totals.messages_in).toBe(7);
		expect(byId.get("dev-b")?.totals.messages_in).toBe(5);
		expect(byId.get("dev-b")?.name).toBe("Device B");
	});

	test("default window is 12h", async () => {
		const { auth, projectSlug } = await srv.scaffold({
			projectSlug: "pm-default",
			deviceSlug: "dev",
		});
		const res = await srv.get(`/v1/projects/${projectSlug}/metrics`, {
			token: auth.token,
		});
		expect(res.status).toBe(200);
		const r = (
			res.body as { result: { window: string; bucket_seconds: number } }
		).result;
		expect(r.window).toBe("12h");
		expect(r.bucket_seconds).toBe(1800);
	});

	test("unknown project returns 404", async () => {
		const auth = await srv.register({
			email: `pm-404-${crypto.randomUUID()}@example.com`,
		});
		const res = await srv.get("/v1/projects/no-such-project/metrics", {
			token: auth.token,
		});
		expect(res.status).toBe(404);
	});

	test("unauthenticated request is rejected", async () => {
		const { projectSlug } = await srv.scaffold({
			projectSlug: "pm-unauth",
			deviceSlug: "dev",
		});
		const res = await srv.get(`/v1/projects/${projectSlug}/metrics`);
		expect(res.status).toBe(401);
	});
});
