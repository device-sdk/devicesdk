import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CRON_STORAGE_KEY } from "../../src/runtime/cronDispatch";
import { TestServer } from "../harness";

const CRON_SCRIPT = `
export class CronEntry {
	constructor(ctx, env) { this.env = env; }
	async onDeviceConnect() {}
	get crons() { return { tick: "*/5 * * * *", nightly: "0 0 * * *" }; }
	async onCron(name) { console.log("cron", name); }
}
`;

const NO_CRON_SCRIPT = `
export class Plain {
	constructor(ctx, env) { this.env = env; }
	async onDeviceConnect() {}
	get crons() { return {}; }
}
`;

// A cron script whose onMessage can hold the FIFO dispatch chain for 4 s, so
// a test can queue a cron fire behind a busy handler and then disconnect.
const BUSY_CRON_SCRIPT = `
export class BusyCron {
	constructor(ctx, env) { this.env = env; }
	async onDeviceConnect() {}
	get crons() { return { tick: "*/5 * * * *" }; }
	async onMessage(message) {
		if (message.type === "busy") {
			await new Promise((resolve) => setTimeout(resolve, 4000));
		}
	}
	async onCron(name) { console.log("cron fired", name); }
}
`;

let srv: TestServer;

beforeAll(async () => {
	srv = await TestServer.start();
});
afterAll(() => srv.stop());

function cronStorage(deviceSlug: string, projectSlug: string): unknown {
	const row = srv.db
		.query(
			`SELECT kv.value FROM device_kv kv
			 JOIN devices d ON d.id = kv.device_id
			 JOIN projects p ON p.id = d.project_id
			 WHERE d.device_slug = ?1 AND p.project_slug = ?2 AND kv.key = ?3`,
		)
		.get(deviceSlug, projectSlug, CRON_STORAGE_KEY) as { value: string } | null;
	return row ? JSON.parse(row.value) : null;
}

describe("connection-gated cron scheduling", () => {
	test("device_connected persists the cron schedule; reconnect re-arms it", async () => {
		const auth = await srv.register({
			email: `cron-${crypto.randomUUID()}@example.com`,
		});
		const token = auth.token;
		await srv.post("/v1/projects", { token, body: { project_slug: "cron" } });
		await srv.post("/v1/projects/cron/devices", {
			token,
			body: { device_id: "clock" },
		});
		await srv.put("/v1/projects/cron/devices/clock/script", {
			token,
			body: { script: CRON_SCRIPT, entrypoint: "CronEntry" },
		});

		const device = await srv.connectDevice(token, "cron", "clock");
		device.sendConnected();
		// initializeCrons runs in the dispatch chain after onDeviceConnect
		await Bun.sleep(300);

		const stored = cronStorage("clock", "cron") as Record<
			string,
			{ cron: string; nextFireAt: number }
		> | null;
		expect(stored).toBeTruthy();
		expect(Object.keys(stored ?? {}).sort()).toEqual(["nightly", "tick"]);
		expect(stored?.tick.cron).toBe("*/5 * * * *");
		expect(stored?.tick.nextFireAt).toBeGreaterThan(Date.now());
		const firstNextFire = stored?.tick.nextFireAt;

		// Reconnect: rearmCronsFromStorage keeps unchanged future fire times.
		await device.close();
		await Bun.sleep(150);
		const device2 = await srv.connectDevice(token, "cron", "clock");
		device2.sendConnected();
		await Bun.sleep(300);
		const stored2 = cronStorage("clock", "cron") as Record<
			string,
			{ cron: string; nextFireAt: number }
		> | null;
		expect(stored2?.tick.nextFireAt).toBe(firstNextFire);
		await device2.close();
	});

	test("a script with no crons clears any persisted schedule", async () => {
		const auth = await srv.register({
			email: `nocron-${crypto.randomUUID()}@example.com`,
		});
		const token = auth.token;
		await srv.post("/v1/projects", { token, body: { project_slug: "nocron" } });
		await srv.post("/v1/projects/nocron/devices", {
			token,
			body: { device_id: "clock" },
		});
		// First deploy a cron script and connect so a schedule is persisted.
		await srv.put("/v1/projects/nocron/devices/clock/script", {
			token,
			body: { script: CRON_SCRIPT, entrypoint: "CronEntry" },
		});
		const d1 = await srv.connectDevice(token, "nocron", "clock");
		d1.sendConnected();
		await Bun.sleep(300);
		expect(cronStorage("clock", "nocron")).toBeTruthy();
		await d1.close();
		await Bun.sleep(150);

		// Deploy a cron-less script; on reconnect initializeCrons deletes storage.
		await srv.put("/v1/projects/nocron/devices/clock/script", {
			token,
			body: { script: NO_CRON_SCRIPT, entrypoint: "Plain" },
		});
		const d2 = await srv.connectDevice(token, "nocron", "clock");
		d2.sendConnected();
		await Bun.sleep(300);
		expect(cronStorage("clock", "nocron")).toBeNull();
		await d2.close();
	});

	test("a queued cron fire is skipped when the device goes offline, and resumes on reconnect", async () => {
		const auth = await srv.register({
			email: `cron-offline-${crypto.randomUUID()}@example.com`,
		});
		const token = auth.token;
		await srv.post("/v1/projects", {
			token,
			body: { project_slug: "offline" },
		});
		await srv.post("/v1/projects/offline/devices", {
			token,
			body: { device_id: "clock" },
		});
		await srv.put("/v1/projects/offline/devices/clock/script", {
			token,
			body: { script: BUSY_CRON_SCRIPT, entrypoint: "BusyCron" },
		});

		const deviceRow = srv.db
			.query(
				`SELECT d.id FROM devices d
				 JOIN projects p ON p.id = d.project_id
				 WHERE d.device_slug = 'clock' AND p.project_slug = 'offline'`,
			)
			.get() as { id: string };
		const upsertSchedule = (nextFireAt: number) =>
			srv.db
				.query(
					`INSERT INTO device_kv (device_id, key, value, updated_at)
					 VALUES (?1, ?2, ?3, ?4)
					 ON CONFLICT (device_id, key) DO UPDATE SET value = ?3, updated_at = ?4`,
				)
				.run(
					deviceRow.id,
					CRON_STORAGE_KEY,
					JSON.stringify({
						tick: { cron: "*/5 * * * *", nextFireAt },
					}),
					Date.now(),
				);

		// Seed a near-future fire so the timer arms without waiting for a
		// minute boundary; initializeCrons preserves future fire times.
		upsertSchedule(Date.now() + 3000);

		const watcher = await srv.connectWatcher(token, "offline", "clock");
		const device = await srv.connectDevice(token, "offline", "clock");
		device.sendConnected();
		await Bun.sleep(300); // initializeCrons arms the timer

		// Busy the FIFO chain past the fire time: the cron dispatch queues
		// behind the long-running onMessage (which holds the chain ~4 s).
		device.send({ type: "busy", payload: {} });
		await Bun.sleep(2700); // timer fires at ~3 s while the chain is busy

		// Disconnect while the chain is still busy - the queued cron dispatch
		// would now execute after the disconnect.
		await device.close();
		await Bun.sleep(1700); // busy handler ends ~4.3 s; the cron would fire here

		const fired = watcher.events.some(
			(e) =>
				e.event === "log" &&
				typeof (e.data as { message?: unknown } | undefined)?.message ===
					"string" &&
				(e.data as { message: string }).message.includes("cron fired"),
		);
		expect(fired).toBe(false);

		// Reconnect: the stale schedule is re-armed from storage with a fresh
		// near-future fire; the cron must resume.
		upsertSchedule(Date.now() + 2000);
		const device2 = await srv.connectDevice(token, "offline", "clock");
		device2.sendConnected();
		await watcher.waitFor(
			(e) =>
				e.event === "log" &&
				typeof (e.data as { message?: unknown } | undefined)?.message ===
					"string" &&
				(e.data as { message: string }).message.includes("cron fired"),
		);

		await device2.close();
		watcher.close();
	}, 20000);
});
