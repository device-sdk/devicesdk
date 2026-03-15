/**
 * Integration tests for the BaseDevice cron schedule storage, kv guard,
 * and alarm scheduling behavior.
 *
 * These tests cover:
 * 1. The `__internal:` key prefix guard in kvPut/kvGet/kvDelete — user code
 *    cannot read or corrupt internal scheduler state.
 * 2. Normal user kv operations continue to work correctly.
 * 3. kv storage isolation between device instances.
 * 4. initializeCrons() and alarm() scheduling behavior using test helpers.
 *
 * Note: Testing that onCron() is actually called on the user script requires
 * the LOADER worker binding to dynamically instantiate user scripts, which is
 * not available in the unit test environment. That path is covered by E2E /
 * manual tests. The pure dispatch logic (due detection, schedule advancement)
 * is tested exhaustively in cronDispatch.test.ts.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CRON_STORAGE_KEY } from "../../src/durableObjects/lib/device";
import type { CronStorage } from "../../src/durableObjects/lib/cronDispatch";

function getDeviceStub(name: string) {
	const id = env.DEVICE.idFromName(name);
	return env.DEVICE.get(id);
}

// Helper to call a DO RPC that is expected to throw and return the caught error.
// Using try/catch instead of rejects.toThrow() avoids emitting spurious unhandled
// rejection events that confuse the isolated-storage cleanup in vitest-pool-workers.
async function catchDoError(fn: () => Promise<unknown>): Promise<Error | null> {
	try {
		await fn();
		return null;
	} catch (e) {
		return e as Error;
	}
}

describe.sequential("BaseDevice — kv guard for internal keys", () => {
	it("CRON_STORAGE_KEY uses the __internal: prefix", () => {
		expect(CRON_STORAGE_KEY.startsWith("__internal:")).toBe(true);
	});

	it("kvPut rejects __internal: keys with an error", async () => {
		const stub = getDeviceStub("kv-guard-test:device-1");
		const err = await catchDoError(() =>
			stub.kvPut(CRON_STORAGE_KEY, { foo: "bar" }),
		);
		expect(err).not.toBeNull();
		expect(err?.message).toMatch(/reserved for internal use/i);
	});

	it("kvGet for __internal: key throws (consistent with kvPut)", async () => {
		const stub = getDeviceStub("kv-guard-test:device-2");
		const err = await catchDoError(() => stub.kvGet(CRON_STORAGE_KEY));
		expect(err).not.toBeNull();
		expect(err?.message).toMatch(/reserved for internal use/i);
	});

	it("kvDelete for __internal: key returns false (no-op)", async () => {
		const stub = getDeviceStub("kv-guard-test:device-3");
		const result = await stub.kvDelete(CRON_STORAGE_KEY);
		expect(result).toBe(false);
	});

	it("arbitrary __internal: prefixed keys are also blocked", async () => {
		const stub = getDeviceStub("kv-guard-test:device-4");
		const putErr = await catchDoError(() =>
			stub.kvPut("__internal:anything", "value"),
		);
		expect(putErr).not.toBeNull();

		const getErr = await catchDoError(() => stub.kvGet("__internal:anything"));
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

describe.sequential("BaseDevice — cron storage helpers", () => {
	it("getScheduledAlarmTime returns null when no alarm is set", async () => {
		const stub = getDeviceStub("alarm-helpers-test:device-1");
		const alarmTime = await stub.getScheduledAlarmTime();
		expect(alarmTime).toBeNull();
	});

	it("_testSeedCronStorage writes to internal storage without throwing", async () => {
		const stub = getDeviceStub("alarm-helpers-test:device-2");
		const now = Date.now();
		const schedule: CronStorage = {
			ping: { cron: "*/1 * * * *", nextFireAt: now + 30_000 },
		};
		await expect(
			stub._testSeedCronStorage(schedule),
		).resolves.toBeUndefined();
	});

	it("_testSeedCronStorage with null clears cron storage", async () => {
		const stub = getDeviceStub("alarm-helpers-test:device-3");
		const now = Date.now();

		// Seed something first
		await stub._testSeedCronStorage({
			ping: { cron: "*/1 * * * *", nextFireAt: now + 1000 },
		});

		// Clear it
		await stub._testSeedCronStorage(null);

		// alarm() with no schedules hits the legacy path — worker fails (no LOADER)
		// but returns cleanly without setting an alarm
		await stub.alarm();
		const alarmTime = await stub.getScheduledAlarmTime();
		expect(alarmTime).toBeNull();
	});
});

describe.sequential(
	"BaseDevice — alarm() reschedules without advancing when worker unavailable",
	() => {
		it("reschedules when stored crons exist but worker cannot be loaded", async () => {
			const stub = getDeviceStub("alarm-fallback-test:device-1");
			const now = Date.now();

			// Seed a past-due schedule
			const schedule: CronStorage = {
				heartbeat: {
					cron: "*/5 * * * *",
					nextFireAt: now - 1000, // already past due
				},
			};
			await stub._testSeedCronStorage(schedule);

			// alarm() catches the worker init failure (LOADER unavailable in tests)
			// and reschedules without advancing nextFireAt
			await stub.alarm();

			// Alarm should have been rescheduled
			const alarmTime = await stub.getScheduledAlarmTime();
			expect(alarmTime).toBeGreaterThan(now);
		});

		it("reschedules at least 60s in the future to prevent tight retry loops", async () => {
			const stub = getDeviceStub("alarm-fallback-test:device-2");
			const now = Date.now();

			// Seed a schedule that was already past-due (very old)
			const schedule: CronStorage = {
				watchdog: {
					cron: "*/1 * * * *",
					nextFireAt: now - 999_000, // very old
				},
			};
			await stub._testSeedCronStorage(schedule);

			await stub.alarm();

			const alarmTime = await stub.getScheduledAlarmTime();
			expect(alarmTime).toBeGreaterThanOrEqual(now + 60_000);
		});

		it("alarm() with no stored schedules does not reschedule on worker failure", async () => {
			const stub = getDeviceStub("alarm-fallback-test:device-3");

			// No cron storage — alarm() hits the legacy path which just returns on failure
			await stub.alarm();

			const alarmTime = await stub.getScheduledAlarmTime();
			expect(alarmTime).toBeNull();
		});
	},
);
