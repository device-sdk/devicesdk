/**
 * Integration tests for the device WebSocket connect → disconnect → reconnect
 * lifecycle, driven by a real WebSocket client against the BaseDevice Durable
 * Object (via the TestDevice subclass).
 *
 * Regression target: an ESP32 that connected once (after an API deploy), then
 * power-cycled, would reconnect at the TCP/WS layer (firmware reaches
 * WEBSOCKET_EVENT_CONNECTED and shows "Server") but never receive a command
 * again — it sat on the "Server" screen forever. Root cause: handleConnectionLost
 * (called from the Hibernation-API webSocketClose / webSocketError handlers)
 * invoked the Worker Loader inline (getOrCreateUserWorker + onDeviceDisconnect),
 * which hangs from a Hibernation-API handler and wedged the device. The fix
 * defers onDeviceDisconnect to the alarm-drained user-event queue, so the close
 * handler only does cheap storage work and the next connect is always served.
 *
 * The Worker Loader cannot instantiate user scripts in the test environment, so
 * the deferred drain is routed through a no-op worker (useNoopWorker). That lets
 * the real connect/disconnect/reconnect path — including the alarm that the
 * disconnect now arms — run end-to-end without the drain throwing. The
 * disconnect-enqueue behaviour itself is asserted directly via
 * testSimulateDisconnect, and exhaustively in tests/unit/userEventQueue.test.ts.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { PendingUserEvent } from "../../src/durableObjects/lib/userEventQueue";

type TestStub = {
	fetch: (input: string, init?: RequestInit) => Promise<Response>;
	getConnectionStatus(): Promise<{
		connected: boolean;
		connectedSince: number | null;
	}>;
	testSimulateDisconnect(): Promise<{ pending: PendingUserEvent[] }>;
	useNoopWorker(): Promise<void>;
	clearSchedulerState(): Promise<void>;
	getDeviceSocketCounts(): Promise<{ total: number; open: number }>;
};

function getStub(name: string): TestStub {
	const id = env.TEST_DEVICE.idFromName(name);
	return env.TEST_DEVICE.get(id) as unknown as TestStub;
}

/** Opens (and accepts) a device WebSocket to the DO, mirroring deviceConnect.ts. */
async function openDeviceSocket(
	stub: TestStub,
	name: string,
): Promise<WebSocket> {
	const url = new URL("https://do.local/websocket");
	url.searchParams.set("userId", "user-1");
	url.searchParams.set("projectId", `proj-${name}`);
	url.searchParams.set("deviceId", `device-${name}`);
	url.searchParams.set("projectSlug", `proj-${name}`);
	url.searchParams.set("deviceSlug", `device-${name}`);
	url.searchParams.set("versionId", "v-1");
	url.searchParams.set("entrypointName", "Device");
	url.searchParams.set("plan", "paid");

	const res = await stub.fetch(url.toString(), {
		headers: { Upgrade: "websocket" },
	});
	expect(res.status).toBe(101);
	const ws = (res as Response & { webSocket?: WebSocket | null }).webSocket;
	if (!ws) throw new Error("expected a WebSocket on the 101 response");
	ws.accept();
	return ws;
}

/** Polls the DO's connection status until it matches `want` or times out. */
async function waitForConnected(
	stub: TestStub,
	want: boolean,
	timeoutMs = 2000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (true) {
		const { connected } = await stub.getConnectionStatus();
		if (connected === want) return;
		if (Date.now() > deadline) {
			throw new Error(
				`timed out waiting for connected=${want} (still ${connected})`,
			);
		}
		await new Promise<void>((r) => setTimeout(r, 25));
	}
}

describe.sequential("Device WebSocket connect/disconnect/reconnect", () => {
	it("serves the upgrade and reports the device connected", async () => {
		const stub = getStub("reconnect-test:connect");
		await stub.useNoopWorker();

		const ws = await openDeviceSocket(stub, "connect");
		await waitForConnected(stub, true);
		expect((await stub.getConnectionStatus()).connected).toBe(true);

		ws.close(1000, "test done");
		await stub.clearSchedulerState();
	});

	it("queues onDeviceDisconnect instead of invoking the worker inline", async () => {
		const stub = getStub("reconnect-test:disconnect-enqueue");
		await stub.useNoopWorker();

		await openDeviceSocket(stub, "disconnect-enqueue");
		await waitForConnected(stub, true);

		// Exercise the production close path (handleConnectionLost) directly so the
		// assertion is deterministic and not subject to async close delivery. The
		// fix: the lifecycle hook is enqueued, never invoked inline from the
		// Hibernation-API handler (which would hang the Worker Loader in prod).
		const { pending } = await stub.testSimulateDisconnect();
		expect(pending.some((e) => e.kind === "disconnect")).toBe(true);

		await stub.clearSchedulerState();
	});

	it("re-serves the upgrade on reconnect after a disconnect (not stuck on 'Server')", async () => {
		const stub = getStub("reconnect-test:cycle");
		await stub.useNoopWorker();

		// First connect (as after an API deploy): works.
		const ws1 = await openDeviceSocket(stub, "cycle");
		await waitForConnected(stub, true);
		// Firmware handshake on WEBSOCKET_EVENT_CONNECTED; drains via the no-op worker.
		ws1.send(JSON.stringify({ type: "device_connected" }));

		// Run the production disconnect teardown (handleConnectionLost) — the path
		// that used to wedge the DO by invoking the Worker Loader inline.
		await stub.testSimulateDisconnect();
		// Device power-cycles: drop the old socket. We don't wait on async close
		// delivery — the reconnect below is what proves the device isn't wedged.
		ws1.close(1000, "power cycle");

		// Device boots again and reconnects. The regression was that this second
		// handshake was served at the WS layer but the device never advanced past
		// "Server" because the DO was wedged by the previous disconnect. Here the
		// reconnect is served and the DO reports the device connected.
		const ws2 = await openDeviceSocket(stub, "cycle");
		await waitForConnected(stub, true);
		expect((await stub.getConnectionStatus()).connected).toBe(true);

		ws2.close(1000, "test done");
		await stub.clearSchedulerState();
	});

	it("closes a stale (ghost) device socket when a new device connects", async () => {
		const stub = getStub("reconnect-test:ghost");
		await stub.useNoopWorker();

		// First connect. The device then loses power abruptly — the runtime hasn't
		// reaped the half-open socket yet, so we deliberately do NOT close ws1: it
		// stands in for the lingering ghost connection.
		const ws1 = await openDeviceSocket(stub, "ghost");
		await waitForConnected(stub, true);
		expect((await stub.getDeviceSocketCounts()).open).toBe(1);

		// Device reboots and reconnects while the ghost is still attached. The fix
		// closes the stale socket before accepting the new one, so the DO is left
		// with exactly one OPEN device socket (command dispatch can't target a dead
		// connection → device won't be stuck on "Server").
		const ws2 = await openDeviceSocket(stub, "ghost");
		await waitForConnected(stub, true);

		const counts = await stub.getDeviceSocketCounts();
		expect(counts.open).toBe(1);

		// The ghost's client side observes the server-initiated close (delivered
		// asynchronously, so poll rather than asserting a single snapshot).
		const deadline = Date.now() + 2000;
		while (
			ws1.readyState === WebSocket.READY_STATE_OPEN &&
			Date.now() < deadline
		) {
			await new Promise<void>((r) => setTimeout(r, 25));
		}
		expect(ws1.readyState).not.toBe(WebSocket.READY_STATE_OPEN);

		ws2.close(1000, "test done");
		await stub.clearSchedulerState();
	});
});
