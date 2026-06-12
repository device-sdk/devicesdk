import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer } from "../harness";

// Device "caller" reaches into "callee" via this.env.DEVICES["callee"].method().
// Results are surfaced to a watcher through console logs so the test can observe
// them without extra plumbing.
const CALLER_SCRIPT = `
export class Caller {
	constructor(ctx, env) { this.env = env; }
	async onDeviceConnect() {}
	async onMessage(message) {
		const target = this.env.DEVICES["callee"];
		try {
			switch (message.type) {
				case "rpc_add": {
					const r = await target.add(2, 3);
					console.log("result", r);
					break;
				}
				case "rpc_blocked":
					await target.onDeviceConnect();
					break;
				case "rpc_missing":
					await target.doesNotExist();
					break;
				case "rpc_unknown_device":
					await this.env.DEVICES["ghost"].add(1, 1);
					break;
			}
		} catch (e) {
			console.error("rpc error", String(e && e.message));
		}
	}
}
`;

const CALLEE_SCRIPT = `
export class Callee {
	constructor(ctx, env) { this.env = env; }
	async onDeviceConnect() {}
	async add(a, b) { return a + b; }
}
`;

let srv: TestServer;
let token: string;

beforeAll(async () => {
	srv = await TestServer.start();
	const auth = await srv.register({
		email: `rpc-${crypto.randomUUID()}@example.com`,
	});
	token = auth.token;
	await srv.post("/v1/projects", { token, body: { project_slug: "rpc" } });
	for (const [slug, script, entry] of [
		["caller", CALLER_SCRIPT, "Caller"],
		["callee", CALLEE_SCRIPT, "Callee"],
	] as const) {
		await srv.post("/v1/projects/rpc/devices", {
			token,
			body: { device_id: slug },
		});
		await srv.put(`/v1/projects/rpc/devices/${slug}/script`, {
			token,
			body: { script, entrypoint: entry },
		});
	}
});
afterAll(() => srv.stop());

describe("inter-device RPC bridge", () => {
	test("a device calls a public method on a sibling that never connected", async () => {
		const watcher = await srv.connectWatcher(token, "rpc", "caller");
		const caller = await srv.connectDevice(token, "rpc", "caller");
		// callee has no live socket — RPC resolves against its deployed script.
		caller.sendConnected();
		await watcher.waitFor((e) => e.event === "status");

		caller.send({ type: "rpc_add", payload: {} });
		const log = await watcher.waitFor(
			(e) =>
				e.event === "log" &&
				(e.data as { message: string }).message.includes("result") &&
				(e.data as { message: string }).message.includes("5"),
		);
		expect(log).toBeTruthy();
		watcher.close();
		await caller.close();
	});

	test("blocked lifecycle methods, missing methods, and unknown devices error", async () => {
		const watcher = await srv.connectWatcher(token, "rpc", "caller");
		const caller = await srv.connectDevice(token, "rpc", "caller");
		caller.sendConnected();
		await watcher.waitFor((e) => e.event === "status");

		const expectErrorContaining = async (type: string, needle: string) => {
			caller.send({ type, payload: {} });
			const log = await watcher.waitFor(
				(e) =>
					e.event === "log" &&
					(e.data as { level: string }).level === "error" &&
					(e.data as { message: string }).message.includes("rpc error") &&
					(e.data as { message: string }).message.includes(needle),
			);
			expect(log).toBeTruthy();
		};

		await expectErrorContaining("rpc_blocked", "onDeviceConnect");
		await expectErrorContaining("rpc_missing", "doesNotExist");
		await expectErrorContaining("rpc_unknown_device", "ghost");

		watcher.close();
		await caller.close();
	});

	test("RPC to a device with no deployed script errors", async () => {
		await srv.post("/v1/projects/rpc/devices", {
			token,
			body: { device_id: "scriptless" },
		});
		const probe = `
export class Probe {
	constructor(ctx, env) { this.env = env; }
	async onMessage() {
		try { await this.env.DEVICES["scriptless"].add(1,1); }
		catch (e) { console.error("probe", String(e && e.message)); }
	}
}`;
		await srv.post("/v1/projects/rpc/devices", {
			token,
			body: { device_id: "prober" },
		});
		await srv.put("/v1/projects/rpc/devices/prober/script", {
			token,
			body: { script: probe, entrypoint: "Probe" },
		});
		const watcher = await srv.connectWatcher(token, "rpc", "prober");
		const prober = await srv.connectDevice(token, "rpc", "prober");
		prober.sendConnected();
		await watcher.waitFor((e) => e.event === "status");
		prober.send({ type: "go", payload: {} });
		const log = await watcher.waitFor(
			(e) =>
				e.event === "log" &&
				(e.data as { message: string }).message.includes("probe") &&
				(e.data as { message: string }).message.includes("no deployed script"),
		);
		expect(log).toBeTruthy();
		watcher.close();
		await prober.close();
	});
});
