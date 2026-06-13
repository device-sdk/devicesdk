import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { deviceScriptSource, TestServer } from "../harness";

let srv: TestServer;

beforeAll(async () => {
	srv = await TestServer.start();
});

afterAll(() => srv.stop());

describe("end-to-end device lifecycle", () => {
	test("auth status reports first-run state then a registered user", async () => {
		const before = await srv.get("/v1/auth/status");
		expect(before.status).toBe(200);
		expect(
			(before.body as { result: { has_users: boolean } }).result.has_users,
		).toBe(false);

		const auth = await srv.register({ email: "owner@example.com" });
		expect(auth.token).toBeTruthy();
		expect(auth.user.email).toBe("owner@example.com");

		const after = await srv.get("/v1/auth/status");
		expect(
			(after.body as { result: { has_users: boolean } }).result.has_users,
		).toBe(true);
	});

	test("project + device + script upload + device connect + command + watch", async () => {
		const auth = await srv.login("owner@example.com");

		// project
		const proj = await srv.post("/v1/projects", {
			token: auth,
			body: { project_slug: "home", name: "Home" },
		});
		expect(proj.status).toBe(201);

		// device
		const dev = await srv.post("/v1/projects/home/devices", {
			token: auth,
			body: { device_id: "sensor" },
		});
		expect(dev.status).toBe(201);

		// upload script
		const upload = await srv.put("/v1/projects/home/devices/sensor/script", {
			token: auth,
			body: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
		});
		expect(upload.status).toBe(201);
		const versionId = (upload.body as { result: { version_id: string } }).result
			.version_id;
		expect(versionId).toBeTruthy();

		// device offline → status reflects it
		const statusOffline = await srv.get(
			"/v1/projects/home/devices/sensor/status",
			{ token: auth },
		);
		expect(statusOffline.status).toBe(200);
		expect(
			(statusOffline.body as { result: { connected: boolean } }).result
				.connected,
		).toBe(false);

		// command while offline → 503
		const cmdOffline = await srv.post(
			"/v1/projects/home/devices/sensor/command",
			{ token: auth, body: { type: "get_temperature", payload: {} } },
		);
		expect(cmdOffline.status).toBe(503);

		// connect the device over WS + attach a watcher
		const watcher = await srv.connectWatcher(auth, "home", "sensor");
		const device = await srv.connectDevice(auth, "home", "sensor");
		device.sendConnected();

		// watcher sees the device come online
		await watcher.waitFor(
			(e) =>
				e.event === "status" &&
				(e.data as { connected: boolean }).connected === true,
		);

		// status endpoint now reports connected
		const statusOnline = await srv.get(
			"/v1/projects/home/devices/sensor/status",
			{ token: auth },
		);
		expect(
			(statusOnline.body as { result: { connected: boolean } }).result
				.connected,
		).toBe(true);

		// send a command; device replies; REST resolves with the response
		const cmdPromise = srv.post("/v1/projects/home/devices/sensor/command", {
			token: auth,
			body: { type: "get_temperature", payload: {} },
		});
		const cmd = await device.nextCommand();
		expect(cmd.type).toBe("get_temperature");
		device.respond(String(cmd.id), "temperature_result", { celsius: 21.5 });
		const cmdRes = await cmdPromise;
		expect(cmdRes.status).toBe(200);
		expect(
			(cmdRes.body as { result: { payload: { celsius: number } } }).result
				.payload.celsius,
		).toBe(21.5);

		// watcher receives the temperature state broadcast
		await watcher.waitFor(
			(e) =>
				e.event === "state" &&
				(e.data as { entity_id: string }).entity_id === "temperature",
		);

		watcher.close();
		await device.close();
	});
});
