/**
 * Integration tests for the alarm-deferred user-worker event dispatch path.
 *
 * Covers:
 *   - enqueueUserWorkerEvent persists events and arms an ASAP alarm.
 *   - drainPendingUserWorkerEvents clears the queue and classifies failures
 *     via TRANSIENT_ERROR_PATTERNS (transient → re-queue with backoff,
 *     persistent → drop the batch).
 *
 * The drain-success path (real LOADER + R2 script) is exercised by the
 * hardware integration described in the PR; here we use TestDevice's
 * setTestWorkerInitError hook to drive the failure-classification branches
 * deterministically without depending on real CF rate-limit behaviour.
 */

import { env } from "cloudflare:test";
import type { GpioStateChanged } from "@devicesdk/core";
import { describe, expect, it } from "vitest";
import {
	PENDING_USER_EVENTS_KEY,
	type PendingUserEvent,
} from "../../src/durableObjects/lib/userEventQueue";

const gpioStateChangedFixture = (
	pin: number,
	state: "high" | "low",
): GpioStateChanged => ({
	id: `m-${pin}-${state}`,
	type: "gpio_state_changed",
	payload: { pin, state },
});

function getTestDeviceStub(name: string) {
	const id = env.TEST_DEVICE.idFromName(name);
	return env.TEST_DEVICE.get(id) as unknown as {
		seedPendingUserEvents(events: PendingUserEvent[] | null): Promise<void>;
		getPendingUserEvents(): Promise<PendingUserEvent[]>;
		testEnqueueAndSnapshot(event: PendingUserEvent): Promise<{
			pending: PendingUserEvent[];
			alarmTime: number | null;
		}>;
		testEnqueueDoesNotPushAlarmOut(
			preArmedAlarmAt: number,
			event: PendingUserEvent,
		): Promise<{ before: number | null; after: number | null }>;
		testDrainPendingUserWorkerEvents(): Promise<{
			workerResolved: boolean;
			remaining: PendingUserEvent[];
		}>;
		setTestWorkerInitError(message: string | null): Promise<void>;
		getScheduledAlarmTime(): Promise<number | null>;
	};
}

describe.sequential("PENDING_USER_EVENTS_KEY constant", () => {
	it("uses the __internal: prefix so it is blocked from user kv", () => {
		expect(PENDING_USER_EVENTS_KEY.startsWith("__internal:")).toBe(true);
	});
});

describe.sequential("enqueueUserWorkerEvent", () => {
	it("persists a single event and arms an ASAP alarm", async () => {
		const stub = getTestDeviceStub("enqueue-test:device-1");
		const before = Date.now();

		const { pending, alarmTime } = await stub.testEnqueueAndSnapshot({
			kind: "connect",
		});

		expect(pending).toEqual([{ kind: "connect" }]);
		expect(alarmTime).not.toBeNull();
		// Alarm is armed for ~now+10ms; allow a generous upper bound to absorb
		// scheduling jitter inside miniflare.
		expect(alarmTime).toBeGreaterThanOrEqual(before);
		expect(alarmTime).toBeLessThan(before + 5_000);
	});

	it("appends successive events without losing earlier ones", async () => {
		const stub = getTestDeviceStub("enqueue-test:device-2");
		// Pre-seed an existing event so the next enqueue must append to it.
		// Going through testEnqueueAndSnapshot would race the ASAP alarm.
		await stub.seedPendingUserEvents([{ kind: "connect" }]);

		const { pending } = await stub.testEnqueueAndSnapshot({
			kind: "message",
			message: gpioStateChangedFixture(8, "high"),
		});

		expect(pending).toHaveLength(2);
		expect(pending[0]).toEqual({ kind: "connect" });
		expect(pending[1].kind).toBe("message");
	});

	it("does not push an already-sooner alarm out", async () => {
		const stub = getTestDeviceStub("enqueue-test:device-3");
		// Pre-arm with a past timestamp — miniflare normalizes it but the
		// resulting `before` value will still be sooner than enqueue's
		// `Date.now() + 10`, which is what the guard cares about.
		const preArmedAt = Date.now() - 1000;
		const { before, after } = await stub.testEnqueueDoesNotPushAlarmOut(
			preArmedAt,
			{ kind: "connect" },
		);
		expect(before).not.toBeNull();
		// Enqueue must preserve the sooner pre-armed alarm rather than push it
		// out by ~10 ms.
		expect(after).toBe(before);
	});
});

describe.sequential("drainPendingUserWorkerEvents — failure classification", () => {
	it("with no events queued, returns null and is a no-op", async () => {
		const stub = getTestDeviceStub("drain-empty:device-1");
		const result = await stub.testDrainPendingUserWorkerEvents();
		expect(result.workerResolved).toBe(false);
		expect(result.remaining).toEqual([]);
	});

	it("re-queues events with bumped attempts when worker init throws a transient error", async () => {
		const stub = getTestDeviceStub("drain-transient:device-1");

		// Seed two pending events
		await stub.seedPendingUserEvents([
			{ kind: "connect" },
			{ kind: "message", message: gpioStateChangedFixture(8, "low") },
		]);

		// Simulate the CF Worker Loader rate limit. After F1 the wrapped error
		// includes this message, so TRANSIENT_ERROR_PATTERNS will match.
		await stub.setTestWorkerInitError("Too many concurrent dynamic workers");

		const result = await stub.testDrainPendingUserWorkerEvents();

		expect(result.workerResolved).toBe(false);
		expect(result.remaining).toHaveLength(2);
		// Both events should have been re-queued with attempts=1
		for (const ev of result.remaining) {
			expect(ev.attempts).toBe(1);
		}
	});

	it("drops the batch when worker init throws a persistent error", async () => {
		const stub = getTestDeviceStub("drain-persistent:device-1");

		await stub.seedPendingUserEvents([{ kind: "connect" }]);

		// SyntaxError-style failure: not in TRANSIENT_ERROR_PATTERNS.
		await stub.setTestWorkerInitError("SyntaxError: Unexpected reserved word");

		const result = await stub.testDrainPendingUserWorkerEvents();

		expect(result.workerResolved).toBe(false);
		expect(result.remaining).toEqual([]);
	});

	it("drops the batch after MAX_USER_EVENT_ATTEMPTS even on transient errors", async () => {
		const stub = getTestDeviceStub("drain-maxattempts:device-1");

		// Seed an event that has already been attempted 5 times — one more
		// transient failure should push it over the cap (6) and drop it.
		await stub.seedPendingUserEvents([{ kind: "connect", attempts: 5 }]);

		await stub.setTestWorkerInitError("Too many concurrent dynamic workers");

		const result = await stub.testDrainPendingUserWorkerEvents();

		expect(result.workerResolved).toBe(false);
		expect(result.remaining).toEqual([]);
	});
});
