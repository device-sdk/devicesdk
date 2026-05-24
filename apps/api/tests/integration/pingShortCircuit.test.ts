/**
 * Integration tests for the `webSocketMessage` ping short-circuit.
 *
 * The ESP32 firmware sends `{"type":"ping"}` every IOTKIT_PING_INTERVAL_MS.
 * Pings used to flow through `checkMessageLimit` (2-3 storage reads) and
 * `enqueueUserWorkerEvent` (1 read + 1 write), then trigger an `alarm()`
 * fire — ~7 row reads per keepalive. We now bail before any storage op.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { PendingUserEvent } from "../../src/durableObjects/lib/userEventQueue";

function getTestDeviceStub(name: string) {
	const id = env.TEST_DEVICE.idFromName(name);
	return env.TEST_DEVICE.get(id) as unknown as {
		testHandleDeviceMessage(data: string): Promise<{
			pending: PendingUserEvent[];
			alarmTime: number | null;
		}>;
		getPendingUserEvents(): Promise<PendingUserEvent[]>;
	};
}

describe.sequential("webSocketMessage ping short-circuit", () => {
	it("does not enqueue a pending user-worker event for a ping frame", async () => {
		const stub = getTestDeviceStub("ping-shortcircuit:device-1");

		const { pending, alarmTime } = await stub.testHandleDeviceMessage(
			JSON.stringify({ type: "ping" }),
		);

		expect(pending).toEqual([]);
		expect(alarmTime).toBeNull();
	});

	it("still enqueues for a real device message (regression guard)", async () => {
		const stub = getTestDeviceStub("ping-shortcircuit:device-2");

		const { pending, alarmTime } = await stub.testHandleDeviceMessage(
			JSON.stringify({
				type: "gpio_state_changed",
				id: "m-1",
				payload: { pin: 4, state: "low" },
			}),
		);

		expect(pending).toHaveLength(1);
		expect(pending[0].kind).toBe("message");
		expect(alarmTime).not.toBeNull();
	});
});
