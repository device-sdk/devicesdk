/**
 * Integration tests for the device WebSocket connect → disconnect → reconnect
 * lifecycle, driven by a real WebSocket client talking to the BaseDevice
 * Durable Object.
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
 * The Worker Loader (LOADER) cannot instantiate user scripts in the test
 * environment, so these tests assert the connection lifecycle at the DO boundary
 * (handshake served, connection status flips, reconnect succeeds) rather than
 * the user script's onDeviceConnect/onDeviceDisconnect side effects. The queue
 * dispatch of the disconnect event is unit-tested in
 * tests/unit/userEventQueue.test.ts.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/** Opens (and accepts) a device WebSocket to the BaseDevice DO. */
async function openDeviceSocket(stub: DurableObjectStub, name: string) {
	// Mirrors the query params deviceConnect.ts forwards to the DO. The DO
	// derives all identity from these server-trusted params; the values here
	// stand in for a server-authenticated connect.
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
	stub: DurableObjectStub & {
		getConnectionStatus(): Promise<{ connected: boolean }>;
	},
	want: boolean,
	timeoutMs = 2000,
) {
	const deadline = Date.now() + timeoutMs;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const { connected } = await stub.getConnectionStatus();
		if (connected === want) return;
		if (Date.now() > deadline) {
			throw new Error(
				`timed out waiting for connected=${want} (still ${connected})`,
			);
		}
		await new Promise((r) => setTimeout(r, 25));
	}
}

function getDeviceStub(name: string) {
	const id = env.DEVICE.idFromName(name);
	return env.DEVICE.get(id) as DurableObjectStub & {
		getConnectionStatus(): Promise<{
			connected: boolean;
			connectedSince: number | null;
		}>;
	};
}

describe.sequential("Device WebSocket connect/disconnect/reconnect", () => {
	it("serves the upgrade and reports the device connected", async () => {
		const stub = getDeviceStub("reconnect-test:connect");
		const ws = await openDeviceSocket(stub, "connect");

		await waitForConnected(stub, true);
		const status = await stub.getConnectionStatus();
		expect(status.connected).toBe(true);

		ws.close(1000, "test done");
	});

	it("flips to offline after the device socket closes (no inline worker call)", async () => {
		const stub = getDeviceStub("reconnect-test:disconnect");
		const ws = await openDeviceSocket(stub, "disconnect");
		await waitForConnected(stub, true);

		// Complete the handshake the firmware sends on WEBSOCKET_EVENT_CONNECTED.
		ws.send(JSON.stringify({ type: "device_connected" }));

		// Abrupt client close → server webSocketClose → handleConnectionLost.
		// Before the fix this invoked the Worker Loader inline and wedged the DO;
		// now it only does storage work, so the status flips cleanly.
		ws.close(1000, "client gone");

		await waitForConnected(stub, false);
		expect((await stub.getConnectionStatus()).connected).toBe(false);
	});

	it("re-serves the upgrade on reconnect after a disconnect (not stuck on 'Server')", async () => {
		const stub = getDeviceStub("reconnect-test:cycle");

		// First connect (as after an API deploy): works.
		const ws1 = await openDeviceSocket(stub, "cycle");
		await waitForConnected(stub, true);
		ws1.send(JSON.stringify({ type: "device_connected" }));

		// Device power-cycles: socket drops.
		ws1.close(1000, "power cycle");
		await waitForConnected(stub, false);

		// Device boots again and reconnects. The regression was that this second
		// handshake was served at the WS layer but the device never advanced past
		// "Server" because the DO was wedged by the previous disconnect. Here we
		// assert the reconnect is served and the DO reports the device connected.
		const ws2 = await openDeviceSocket(stub, "cycle");
		await waitForConnected(stub, true);
		expect((await stub.getConnectionStatus()).connected).toBe(true);

		ws2.send(JSON.stringify({ type: "device_connected" }));
		ws2.close(1000, "test done");
	});

	it("survives an immediate reconnect with no handshake on the second socket", async () => {
		const stub = getDeviceStub("reconnect-test:rapid");

		const ws1 = await openDeviceSocket(stub, "rapid");
		await waitForConnected(stub, true);
		ws1.close(1000, "drop");
		await waitForConnected(stub, false);

		// Transport-level reconnect that never re-sends device_connected.
		const ws2 = await openDeviceSocket(stub, "rapid");
		await waitForConnected(stub, true);
		expect((await stub.getConnectionStatus()).connected).toBe(true);
		ws2.close(1000, "test done");
	});
});
