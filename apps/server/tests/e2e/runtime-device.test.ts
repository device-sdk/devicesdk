import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer } from "../harness";

// A script that drives a wide slice of the DEVICE sender surface from onMessage,
// so the device simulator can trigger each path by sending a typed frame.
const RIG_SCRIPT = `
export class Rig {
	constructor(ctx, env) { this.env = env; }
	async onDeviceConnect() { console.log("connected"); }
	async onDeviceDisconnect() { console.log("disconnected"); }
	async onMessage(message) {
		const D = this.env.DEVICE;
		try {
			switch (message.type) {
				case "do_gpio": await D.setGpioState(5, "high"); break;
				case "do_pwm": await D.setPwmState(2, 1000, 0.5); break;
				case "do_temp": { const r = await D.getTemperature(); console.log("temp"); break; }
				case "do_pin": await D.getPinState(4, "digital"); break;
				case "do_i2c":
					await D.i2cScan(0);
					await D.i2cWrite(0, "0x3c", ["0xAE"]);
					await D.i2cRead(0, "0x3c", 2, "0xD0");
					break;
				case "do_spi":
					await D.spiConfigure(0, 2, 3, 4, 5, 1000000, 0);
					await D.spiTransfer(0, ["0x01"]);
					await D.spiWrite(0, ["0x02"]);
					await D.spiRead(0, 2);
					break;
				case "do_uart":
					await D.uartConfigure(0, 1, 2, 115200, 8, 1, "none");
					await D.uartWrite(0, ["0x41"]);
					await D.uartRead(0, 4, 100);
					break;
				case "do_ws2812":
					await D.pioWs2812Configure(6, 3);
					await D.pioWs2812Update([[255,0,0],[0,255,0],[0,0,255]]);
					break;
				case "do_watchdog":
					await D.watchdogConfigure(5000, true);
					await D.watchdogFeed();
					break;
				case "do_misc":
					await D.reboot();
					await D.configureGpioInputMonitoring(7, true, "up");
					break;
				case "do_kv": {
					await D.kv.put("k1", { a: 1 });
					const v = await D.kv.get("k1");
					console.log("kv", JSON.stringify(v));
					const del = await D.kv.delete("k1");
					console.log("kvdel", del);
					break;
				}
				case "do_kv_reserved":
					await D.kv.put("__internal:x", 1);
					break;
				case "do_emit": await D.emitState("custom1", 42); break;
				case "do_log": await D.persistLog("warn", "hello-warn"); break;
				case "do_bad_gpio": await D.setGpioState(999, "high"); break;
				case "do_bad_state": await D.setGpioState(5, "sideways"); break;
				case "do_vars": {
					const v = await this.env.VARS.get("FOO");
					const all = await this.env.VARS.getAll();
					console.log("var", v, JSON.stringify(all));
					break;
				}
			}
		} catch (e) {
			console.error("handler error", String(e && e.message));
		}
	}
}
`;

let srv: TestServer;

beforeAll(async () => {
	srv = await TestServer.start();
});
afterAll(() => srv.stop());

async function setupRig(slug: string) {
	const auth = await srv.register({
		email: `${slug}-${crypto.randomUUID()}@example.com`,
	});
	await srv.post("/v1/projects", {
		token: auth.token,
		body: { project_slug: slug },
	});
	await srv.post(`/v1/projects/${slug}/devices`, {
		token: auth.token,
		body: { device_id: "dev" },
	});
	await srv.put(`/v1/projects/${slug}/devices/dev/script`, {
		token: auth.token,
		body: { script: RIG_SCRIPT, entrypoint: "Rig" },
	});
	return auth.token;
}

describe("device session runtime", () => {
	test("exercises the DEVICE sender surface, kv, emit, logs, vars", async () => {
		const token = await setupRig("rig");
		// env var the script reads via VARS
		await srv.put("/v1/projects/rig/env", {
			token,
			body: { vars: { FOO: "bar" } },
		});

		const watcher = await srv.connectWatcher(token, "rig", "dev", {
			backfillLimit: 50,
		});
		const device = await srv.connectDevice(token, "rig", "dev");
		const stopAck = device.startAutoAck();
		device.sendConnected();

		await watcher.waitFor(
			(e) =>
				e.event === "status" && (e.data as { connected: boolean }).connected,
		);

		const triggers = [
			"do_gpio",
			"do_pwm",
			"do_temp",
			"do_pin",
			"do_i2c",
			"do_spi",
			"do_uart",
			"do_ws2812",
			"do_watchdog",
			"do_misc",
			"do_kv",
			"do_kv_reserved",
			"do_emit",
			"do_log",
			"do_bad_gpio",
			"do_bad_state",
			"do_vars",
		];
		for (const type of triggers) device.send({ type, payload: {} });

		// emitState fans a structured `state` event to watchers
		const stateEvt = await watcher.waitFor(
			(e) =>
				e.event === "state" &&
				(e.data as { entity_id: string }).entity_id === "custom1",
		);
		expect((stateEvt.data as { value: number }).value).toBe(42);
		expect((stateEvt.data as { source: string }).source).toBe("user");

		// persistLog from user code reaches watchers as a log event
		const logEvt = await watcher.waitFor(
			(e) =>
				e.event === "log" &&
				(e.data as { message: string }).message === "hello-warn" &&
				(e.data as { level: string }).level === "warn",
		);
		expect(logEvt).toBeTruthy();

		// console.* capture: the kv handler logs the round-tripped value
		await watcher.waitFor(
			(e) =>
				e.event === "log" &&
				typeof (e.data as { message: string }).message === "string" &&
				(e.data as { message: string }).message.includes("kvdel"),
		);

		stopAck();
		watcher.close();
		await device.close();
	});

	test("rejects a second live socket with WS_CLOSE_REPLACED (4001)", async () => {
		const token = await setupRig("replace");
		const first = await srv.connectDevice(token, "replace", "dev");
		first.sendConnected();
		// give the first socket a moment to register as the live one
		await Bun.sleep(150);
		const second = await srv.connectDevice(token, "replace", "dev");
		second.sendConnected();

		await Bun.sleep(300);
		expect(first.closed).toBe(true);
		expect(first.closeCode).toBe(4001);
		await second.close();
	});

	test("socket replacement rejects pending commands immediately", async () => {
		const token = await setupRig("replace-pending");
		const first = await srv.connectDevice(token, "replace-pending", "dev");
		first.sendConnected();
		await Bun.sleep(100);

		// Start a REST command but never let the device respond.
		const cmdPromise = srv.post(
			"/v1/projects/replace-pending/devices/dev/command",
			{
				token,
				body: { type: "get_temperature", payload: {} },
			},
		);

		// Replace the socket before the 5-second command timeout elapses.
		await first.nextCommand(2000);
		const second = await srv.connectDevice(token, "replace-pending", "dev");
		await Bun.sleep(300);

		const res = await cmdPromise;
		// Immediate rejection produces 500, not the 504 timeout path.
		expect(res.status).toBe(500);
		expect((res.body as { error: string }).error).toContain(
			"Replaced by a new device connection",
		);

		await second.close();
	});

	test("command to a connected device that errors → 500", async () => {
		const token = await setupRig("cmderr");
		const device = await srv.connectDevice(token, "cmderr", "dev");
		device.sendConnected();
		await Bun.sleep(100);

		const cmdPromise = srv.post("/v1/projects/cmderr/devices/dev/command", {
			token,
			body: { type: "get_temperature", payload: {} },
		});
		const cmd = await device.nextCommand();
		device.respond(String(cmd.id), "command_error", { error: "boom" });
		const res = await cmdPromise;
		expect(res.status).toBe(500);
		expect((res.body as { success: boolean }).success).toBe(false);
		await device.close();
	});

	test("command with no device response → 504 timeout", async () => {
		const token = await setupRig("timeout");
		const device = await srv.connectDevice(token, "timeout", "dev");
		device.sendConnected();
		await Bun.sleep(100);

		// Never respond; the session's 5s ack timeout fires.
		const res = await srv.post("/v1/projects/timeout/devices/dev/command", {
			token,
			body: { type: "get_temperature", payload: {} },
		});
		expect(res.status).toBe(504);
		await device.close();
	}, 15000);

	test("structured hardware messages broadcast as state events", async () => {
		const token = await setupRig("hw");
		const watcher = await srv.connectWatcher(token, "hw", "dev");
		const device = await srv.connectDevice(token, "hw", "dev");
		device.sendConnected();
		await watcher.waitFor((e) => e.event === "status");

		device.send({
			id: "",
			type: "gpio_state_changed",
			payload: { pin: 12, state: "high" },
		});
		const gpio = await watcher.waitFor(
			(e) =>
				e.event === "state" &&
				(e.data as { entity_id: string }).entity_id === "gpio_pin_12",
		);
		expect((gpio.data as { value: string }).value).toBe("high");

		device.send({
			id: "",
			type: "pin_state_update",
			payload: { pin: 3, value: 512 },
		});
		await watcher.waitFor(
			(e) =>
				e.event === "state" &&
				(e.data as { entity_id: string }).entity_id === "gpio_pin_3_analog",
		);

		watcher.close();
		await device.close();
	});

	test("malformed device frames are ignored without dropping the socket", async () => {
		const token = await setupRig("malformed");
		const device = await srv.connectDevice(token, "malformed", "dev");
		device.sendConnected();
		await Bun.sleep(50);
		// invalid schema (missing required `type`)
		device.send({ foo: "bar" } as Record<string, unknown>);
		// ping keepalive - never wakes user code, never counts as usage
		device.send({ type: "ping", payload: {} });
		await Bun.sleep(100);

		// the device is still the live session: a command still round-trips
		const status = await srv.get("/v1/projects/malformed/devices/dev/status", {
			token,
		});
		expect(
			(status.body as { result: { connected: boolean } }).result.connected,
		).toBe(true);
		await device.close();
	});

	test("watcher backfill replays seeded logs oldest-first then history_complete", async () => {
		const token = await setupRig("backfill");
		// Resolve the device UUID to seed device_logs directly.
		const deviceRow = srv.db
			.query(
				`SELECT d.id FROM devices d
				 JOIN projects p ON p.id = d.project_id
				 WHERE d.device_slug = 'dev' AND p.project_slug = 'backfill'`,
			)
			.get() as { id: string };
		const now = Date.now();
		for (let i = 0; i < 5; i++) {
			srv.db
				.query(
					"INSERT INTO device_logs (id, device_id, level, message, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
				)
				.run(
					crypto.randomUUID(),
					deviceRow.id,
					i % 2 === 0 ? "info" : "warn",
					`log-${i}`,
					now + i,
				);
		}

		const watcher = await srv.connectWatcher(token, "backfill", "dev", {
			backfillLimit: 10,
		});
		const done = await watcher.waitFor((e) => e.event === "history_complete");
		expect(done).toBeTruthy();
		const replayed = watcher.events.filter(
			(e) => e.event === "log" && e.replay,
		);
		expect(replayed.length).toBe(5);
		// oldest first
		expect((replayed[0].data as { message: string }).message).toBe("log-0");
		watcher.close();
	});

	test("disconnect runs onDeviceDisconnect and marks the device offline", async () => {
		const token = await setupRig("disc");
		const device = await srv.connectDevice(token, "disc", "dev");
		device.sendConnected();
		await Bun.sleep(100);
		await device.close();
		await Bun.sleep(200);
		const status = await srv.get("/v1/projects/disc/devices/dev/status", {
			token,
		});
		expect(
			(status.body as { result: { connected: boolean } }).result.connected,
		).toBe(false);
	});

	test("rejects device connection with a versionId belonging to another device", async () => {
		const token = await setupRig("scope");
		await srv.post("/v1/projects/scope/devices", {
			token,
			body: { device_id: "other" },
		});

		const upload = await srv.put("/v1/projects/scope/devices/dev/script", {
			token,
			body: { script: RIG_SCRIPT, entrypoint: "Rig" },
		});
		expect(upload.status).toBe(201);
		const otherVersionId = (upload.body as { result: { version_id: string } })
			.result.version_id;

		// Connecting `other` with `dev`'s versionId must fail before the socket
		// upgrade, so the WebSocket open promise rejects.
		await expect(
			srv.connectDevice(token, "scope", "other", otherVersionId),
		).rejects.toThrow();
	});
});
