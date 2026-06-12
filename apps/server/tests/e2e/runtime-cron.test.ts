import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CRON_STORAGE_KEY } from "../../src/runtime/deviceSession";
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
});
