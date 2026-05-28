/**
 * Integration tests for the BaseDevice cron schedule storage, kv guard,
 * and alarm scheduling behavior.
 *
 * These tests cover:
 * 1. The `__internal:` key prefix guard in kvPut/kvGet/kvDelete — user code
 *    cannot read or corrupt internal scheduler state.
 * 2. Normal user kv operations continue to work correctly.
 * 3. kv storage isolation between device instances.
 * 4. initializeCrons() and alarm() scheduling behavior using TestDevice helpers.
 *
 * Test helper methods (seedCronStorage, getScheduledAlarmTime, triggerAlarm,
 * testKvPut, testKvGet) live on TestDevice, a test-only subclass of BaseDevice,
 * so they are not part of the production API surface. The TEST_DEVICE miniflare
 * binding points to this subclass.
 *
 * Note: Testing that onCron() is actually called on the user script requires
 * the LOADER worker binding to dynamically instantiate user scripts, which is
 * not available in the unit test environment. That path is covered by E2E /
 * manual tests. The pure dispatch logic (due detection, schedule advancement)
 * is tested exhaustively in cronDispatch.test.ts.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { CronStorage } from "../../src/durableObjects/lib/cronDispatch";
import {
	CONNECTED_SINCE_KEY,
	CRON_STORAGE_KEY,
} from "../../src/durableObjects/lib/device";
import type { PendingUserEvent } from "../../src/durableObjects/lib/userEventQueue";

/** Production BaseDevice stub — used only for user kv operations and kvDelete guard (no-throw). */
function getDeviceStub(name: string) {
	const id = env.DEVICE.idFromName(name);
	return env.DEVICE.get(id);
}

/**
 * TestDevice stub — exposes test-only helpers that avoid workerd-level uncaught
 * exceptions:
 * - testKvPut / testKvGet: return error as value instead of throwing (prevents
 *   vitest-pool-workers isolated storage cleanup failures on DO RPC throws)
 * - triggerAlarm: delegates to this.alarm() since `alarm` is a reserved DO
 *   lifecycle method and cannot be called directly via JSRPC
 */
function getTestDeviceStub(name: string) {
	const id = env.TEST_DEVICE.idFromName(name);
	return env.TEST_DEVICE.get(id) as unknown as {
		seedCronStorage(storage: CronStorage | null): Promise<void>;
		getScheduledAlarmTime(): Promise<number | null>;
		triggerAlarm(): Promise<void>;
		triggerAlarmWhileConnected(): Promise<number | null>;
		testInitializeCrons(crons: Record<string, string>): Promise<void>;
		seedPendingUserEvents(events: PendingUserEvent[] | null): Promise<void>;
		setTestWorkerInitError(message: string | null): Promise<void>;
		clearSchedulerState(): Promise<void>;
		testKvPut(key: string, value: unknown): Promise<string | null>;
		testKvGet<T = unknown>(
			key: string,
		): Promise<{ value: T | undefined; error: string | null }>;
		kvPut(key: string, value: unknown): Promise<void>;
		kvGet<T = unknown>(key: string): Promise<T | undefined>;
		kvDelete(key: string): Promise<boolean>;
	};
}

describe.sequential("BaseDevice — kv guard for internal keys", () => {
	it("CRON_STORAGE_KEY uses the __internal: prefix", () => {
		expect(CRON_STORAGE_KEY.startsWith("__internal:")).toBe(true);
	});

	it("CONNECTED_SINCE_KEY uses the __internal: prefix", () => {
		expect(CONNECTED_SINCE_KEY.startsWith("__internal:")).toBe(true);
	});

	it("kvPut rejects __internal: keys with an error", async () => {
		// Use testKvPut (returns error as value) so the DO does not throw at the
		// workerd level — a workerd-level uncaught exception breaks the isolated
		// storage cleanup in vitest-pool-workers.
		const stub = getTestDeviceStub("kv-guard-test:device-1");
		const err = await stub.testKvPut(CRON_STORAGE_KEY, { foo: "bar" });
		expect(err).not.toBeNull();
		expect(err).toMatch(/reserved for internal use/i);
	});

	it("kvGet for __internal: key throws (consistent with kvPut)", async () => {
		const stub = getTestDeviceStub("kv-guard-test:device-2");
		const { error } = await stub.testKvGet(CRON_STORAGE_KEY);
		expect(error).not.toBeNull();
		expect(error).toMatch(/reserved for internal use/i);
	});

	it("kvPut rejects CONNECTED_SINCE_KEY with an error", async () => {
		const stub = getTestDeviceStub("kv-guard-test:device-5");
		const err = await stub.testKvPut(CONNECTED_SINCE_KEY, Date.now());
		expect(err).not.toBeNull();
		expect(err).toMatch(/reserved for internal use/i);
	});

	it("kvDelete for __internal: key returns false (no-op)", async () => {
		const stub = getDeviceStub("kv-guard-test:device-3");
		const result = await stub.kvDelete(CRON_STORAGE_KEY);
		expect(result).toBe(false);
	});

	it("arbitrary __internal: prefixed keys are also blocked", async () => {
		const stub = getTestDeviceStub("kv-guard-test:device-4");
		const putErr = await stub.testKvPut("__internal:anything", "value");
		expect(putErr).not.toBeNull();

		const { error: getErr } = await stub.testKvGet("__internal:anything");
		expect(getErr).not.toBeNull();

		expect(await stub.kvDelete("__internal:anything")).toBe(false);
	});
});

describe.sequential("BaseDevice — user kv operations", () => {
	it("stores and retrieves a user value", async () => {
		const stub = getDeviceStub("kv-user-test:device-1");
		await stub.kvPut("temperature", 23.5);
		const result = await stub.kvGet<number>("temperature");
		expect(result).toBe(23.5);
	});

	it("returns undefined for a key that does not exist", async () => {
		const stub = getDeviceStub("kv-user-test:device-no-key");
		const result = await stub.kvGet("missing");
		expect(result).toBeUndefined();
	});

	it("deletes a user key and returns true", async () => {
		const stub = getDeviceStub("kv-user-test:device-delete");
		await stub.kvPut("sensor", { reading: 42 });
		const deleted = await stub.kvDelete("sensor");
		expect(deleted).toBe(true);
		expect(await stub.kvGet("sensor")).toBeUndefined();
	});

	it("kvDelete returns false for a missing user key", async () => {
		const stub = getDeviceStub("kv-user-test:device-delete-missing");
		const result = await stub.kvDelete("nonexistent");
		expect(result).toBe(false);
	});

	it("overwrites an existing user key", async () => {
		const stub = getDeviceStub("kv-user-test:device-overwrite");
		await stub.kvPut("state", "on");
		await stub.kvPut("state", "off");
		expect(await stub.kvGet("state")).toBe("off");
	});

	it("stores multiple independent keys", async () => {
		const stub = getDeviceStub("kv-user-test:device-multi");
		await stub.kvPut("keyA", 1);
		await stub.kvPut("keyB", 2);
		expect(await stub.kvGet("keyA")).toBe(1);
		expect(await stub.kvGet("keyB")).toBe(2);
	});
});

describe.sequential("BaseDevice — kv isolation between device instances", () => {
	it("each device DO instance has independent kv storage", async () => {
		const stubA = getDeviceStub("kv-isolation-test:device-a");
		const stubB = getDeviceStub("kv-isolation-test:device-b");

		await stubA.kvPut("shared-key", "device-a-value");

		// Device B should not see device A's value
		const resultB = await stubB.kvGet("shared-key");
		expect(resultB).toBeUndefined();
	});

	it("deleting from one device does not affect another", async () => {
		const stubC = getDeviceStub("kv-isolation-test:device-c");
		const stubD = getDeviceStub("kv-isolation-test:device-d");

		await stubC.kvPut("mykey", "c");
		await stubD.kvPut("mykey", "d");

		await stubC.kvDelete("mykey");

		expect(await stubC.kvGet("mykey")).toBeUndefined();
		expect(await stubD.kvGet("mykey")).toBe("d");
	});
});

describe.sequential("TestDevice — cron storage helpers", () => {
	it("getScheduledAlarmTime returns null when no alarm is set", async () => {
		const stub = getTestDeviceStub("alarm-helpers-test:device-1");
		const alarmTime = await stub.getScheduledAlarmTime();
		expect(alarmTime).toBeNull();
	});

	it("seedCronStorage writes to internal storage without throwing", async () => {
		const stub = getTestDeviceStub("alarm-helpers-test:device-2");
		const now = Date.now();
		const schedule: CronStorage = {
			ping: { cron: "*/1 * * * *", nextFireAt: now + 30_000 },
		};
		await expect(stub.seedCronStorage(schedule)).resolves.toBeUndefined();
	});

	it("seedCronStorage with null clears cron storage", async () => {
		const stub = getTestDeviceStub("alarm-helpers-test:device-3");
		const now = Date.now();

		// Seed something first
		await stub.seedCronStorage({
			ping: { cron: "*/1 * * * *", nextFireAt: now + 1000 },
		});

		// Clear it
		await stub.seedCronStorage(null);

		// triggerAlarm() with no schedules hits the legacy path — worker fails
		// (no LOADER) but returns cleanly without setting an alarm
		await stub.triggerAlarm();
		const alarmTime = await stub.getScheduledAlarmTime();
		expect(alarmTime).toBeNull();
	});
});

describe.sequential("TestDevice — alarm() reschedules without advancing when worker unavailable", () => {
	it("reschedules when stored crons exist but worker cannot be loaded", async () => {
		const stub = getTestDeviceStub("alarm-fallback-test:device-1");
		const now = Date.now();

		// Seed a past-due schedule
		const schedule: CronStorage = {
			heartbeat: {
				cron: "*/5 * * * *",
				nextFireAt: now - 1000, // already past due
			},
		};
		await stub.seedCronStorage(schedule);

		// With a device connected, the cron cost guard passes; alarm() then
		// catches the worker init failure (LOADER unavailable in tests) and
		// reschedules without advancing nextFireAt. (triggerAlarmWhileConnected
		// returns the post-alarm scheduled time captured while still connected.)
		const alarmTime = await stub.triggerAlarmWhileConnected();

		// Alarm should have been rescheduled
		expect(alarmTime).toBeGreaterThan(now);
	});

	it("reschedules at least 60s in the future to prevent tight retry loops", async () => {
		const stub = getTestDeviceStub("alarm-fallback-test:device-2");
		const now = Date.now();

		// Seed a schedule that was already past-due (very old)
		const schedule: CronStorage = {
			watchdog: {
				cron: "*/1 * * * *",
				nextFireAt: now - 999_000, // very old
			},
		};
		await stub.seedCronStorage(schedule);

		const alarmTime = await stub.triggerAlarmWhileConnected();

		expect(alarmTime).toBeGreaterThanOrEqual(now + 60_000);
	});

	it("alarm() with no stored schedules does not reschedule on worker failure", async () => {
		const stub = getTestDeviceStub("alarm-fallback-test:device-3");

		// No cron storage — triggerAlarm() hits the legacy path which just
		// returns on failure
		await stub.triggerAlarm();

		const alarmTime = await stub.getScheduledAlarmTime();
		expect(alarmTime).toBeNull();
	});
});

describe.sequential("TestDevice — cron alarm stops when no device is connected", () => {
	it("cancels the cron alarm when the alarm fires with no device connected", async () => {
		// Regression guard for the cost leak: a script with a frequent cron
		// (e.g. every minute) must NOT keep waking the Durable Object after the
		// device disconnects.
		const stub = getTestDeviceStub("cron-guard-test:device-1");

		// Simulate a device that connected and armed a frequent cron.
		await stub.testInitializeCrons({ heartbeat: "*/1 * * * *" });
		expect(await stub.getScheduledAlarmTime()).not.toBeNull();

		// Device is now disconnected; the already-scheduled alarm fires with no
		// device socket present.
		await stub.triggerAlarm();

		// The alarm is cancelled so the DO stops waking — no recurring cost.
		expect(await stub.getScheduledAlarmTime()).toBeNull();
	});

	it("resumes the cron alarm (preserving nextFireAt) when the device reconnects", async () => {
		const stub = getTestDeviceStub("cron-guard-test:device-2");

		// Connected: arm a cron.
		await stub.testInitializeCrons({ heartbeat: "*/5 * * * *" });
		const firstAlarm = await stub.getScheduledAlarmTime();
		expect(firstAlarm).not.toBeNull();

		// Disconnected alarm fire cancels the alarm but must leave the schedule
		// in storage.
		await stub.triggerAlarm();
		expect(await stub.getScheduledAlarmTime()).toBeNull();

		// Reconnect → initializeCrons re-arms. Because the schedule survived, the
		// unchanged cron keeps its original nextFireAt rather than being pushed
		// out a full period.
		await stub.testInitializeCrons({ heartbeat: "*/5 * * * *" });
		expect(await stub.getScheduledAlarmTime()).toBe(firstAlarm);
	});

	it("does NOT cancel the alarm while a device is connected", async () => {
		const stub = getTestDeviceStub("cron-guard-test:device-3");
		const now = Date.now();
		await stub.seedCronStorage({
			heartbeat: { cron: "*/1 * * * *", nextFireAt: now + 30_000 },
		});

		// Device connected: the cost guard passes. The worker can't load (no
		// LOADER in tests), so alarm() reschedules instead of cancelling —
		// proving the guard did not short-circuit on the connection check.
		const alarmTime = await stub.triggerAlarmWhileConnected();
		expect(alarmTime).not.toBeNull();
	});

	it("preserves a transient-retry alarm when disconnected with queued events", async () => {
		// A device message can be queued just before disconnect. If the user
		// Worker can't load right now (transient limit), drain re-queues it and
		// arms a backoff alarm — the guard must NOT cancel that retry.
		const stub = getTestDeviceStub("cron-guard-test:device-4");
		const now = Date.now();

		await stub.seedCronStorage({
			heartbeat: { cron: "*/1 * * * *", nextFireAt: now + 30_000 },
		});
		await stub.seedPendingUserEvents([
			{
				kind: "message",
				message: { id: "m1", type: "telemetry", payload: {} },
				attempts: 3, // bumped to 4 < MAX → re-queued with ~8s backoff
			},
		]);
		await stub.setTestWorkerInitError("Too many concurrent dynamic workers");

		await stub.triggerAlarm(); // disconnected

		// The drain's backoff retry alarm survived the guard.
		expect(await stub.getScheduledAlarmTime()).not.toBeNull();

		// Cleanup: the backoff alarm is only seconds out and would otherwise fire
		// during pool teardown.
		await stub.setTestWorkerInitError(null);
		await stub.clearSchedulerState();
	});
});

describe.sequential("TestDevice — initializeCrons behavior", () => {
	it("schedules an alarm for a valid cron expression", async () => {
		const stub = getTestDeviceStub("init-crons-test:device-1");
		await stub.testInitializeCrons({ heartbeat: "*/5 * * * *" });
		const alarmTime = await stub.getScheduledAlarmTime();
		expect(alarmTime).not.toBeNull();
		expect(alarmTime).toBeGreaterThan(Date.now());
	});

	it("clears storage and alarm when crons map is empty", async () => {
		const stub = getTestDeviceStub("init-crons-test:device-2");
		// First seed some crons so there's an existing alarm
		await stub.testInitializeCrons({ heartbeat: "*/5 * * * *" });
		expect(await stub.getScheduledAlarmTime()).not.toBeNull();

		// Now clear the crons
		await stub.testInitializeCrons({});
		const alarmTime = await stub.getScheduledAlarmTime();
		expect(alarmTime).toBeNull();
	});

	it("clears storage and alarm when all cron expressions are invalid", async () => {
		const stub = getTestDeviceStub("init-crons-test:device-3");
		// Seed a valid schedule first
		const now = Date.now();
		await stub.seedCronStorage({
			old: { cron: "*/5 * * * *", nextFireAt: now + 60_000 },
		});

		// Now try to initialize with an invalid expression — should clear stale state
		await stub.testInitializeCrons({ bad: "not-a-cron" });
		const alarmTime = await stub.getScheduledAlarmTime();
		expect(alarmTime).toBeNull();
	});

	it("preserves nextFireAt for an unchanged cron expression on reconnect", async () => {
		const stub = getTestDeviceStub("init-crons-test:device-4");
		const now = Date.now();
		const existingFireAt = now + 270_000; // 4.5 minutes from now

		// Seed existing schedule as if device had been connected before
		await stub.seedCronStorage({
			heartbeat: { cron: "*/5 * * * *", nextFireAt: existingFireAt },
		});

		// Re-initialize with the same expression (simulates a reconnect)
		await stub.testInitializeCrons({ heartbeat: "*/5 * * * *" });

		// The alarm should be set to the preserved fire time, not pushed out a full period
		const alarmTime = await stub.getScheduledAlarmTime();
		expect(alarmTime).toBe(existingFireAt);
	});

	it("resets nextFireAt when cron expression changes on reconnect", async () => {
		const stub = getTestDeviceStub("init-crons-test:device-5");
		const now = Date.now();
		const oldFireAt = now + 270_000;

		await stub.seedCronStorage({
			heartbeat: { cron: "*/5 * * * *", nextFireAt: oldFireAt },
		});

		// Re-initialize with a changed expression
		await stub.testInitializeCrons({ heartbeat: "*/10 * * * *" });

		// Fire time should be recomputed from now, not the old value
		const alarmTime = await stub.getScheduledAlarmTime();
		expect(alarmTime).not.toBeNull();
		expect(alarmTime).toBeGreaterThan(now);
		expect(alarmTime).not.toBe(oldFireAt);
	});
});
