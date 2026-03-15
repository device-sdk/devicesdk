/**
 * Integration tests for the BaseDevice cron schedule storage.
 *
 * These tests exercise the DO's kv storage interface and verify that cron
 * schedule state is correctly stored and retrieved — covering the storage
 * layer that `initializeCrons()` and `alarm()` rely on.
 *
 * Note: Full end-to-end tests of alarm dispatch (alarm() → onCron() being
 * called inside a user script) require the LOADER worker binding to dynamically
 * instantiate user scripts, which is not available in the unit test environment.
 * Those flows are covered by E2E / manual tests.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// The internal storage key used by BaseDevice for cron schedules.
// Matches the `CRON_STORAGE_KEY` constant in device.ts.
const CRON_STORAGE_KEY = "__cron_schedules";

function getDeviceStub(name: string) {
	const id = env.DEVICE.idFromName(name);
	return env.DEVICE.get(id);
}

describe.sequential("BaseDevice — cron schedule storage", () => {
	describe("kv storage for cron state", () => {
		it("stores and retrieves a cron schedule entry via kv", async () => {
			const stub = getDeviceStub("cron-storage-test:device-1");
			const schedule = {
				heartbeat: { cron: "*/5 * * * *", nextFireAt: Date.now() + 300_000 },
			};

			await stub.kvPut(CRON_STORAGE_KEY, schedule);
			const retrieved = await stub.kvGet<typeof schedule>(CRON_STORAGE_KEY);

			expect(retrieved).toEqual(schedule);
		});

		it("returns undefined when cron schedule has not been initialized", async () => {
			const stub = getDeviceStub("cron-storage-test:device-no-schedule");
			const retrieved = await stub.kvGet(CRON_STORAGE_KEY);

			expect(retrieved).toBeUndefined();
		});

		it("deletes a cron schedule entry", async () => {
			const stub = getDeviceStub("cron-storage-test:device-delete");
			const schedule = {
				watchdog: { cron: "*/1 * * * *", nextFireAt: Date.now() + 60_000 },
			};

			await stub.kvPut(CRON_STORAGE_KEY, schedule);
			const before = await stub.kvGet(CRON_STORAGE_KEY);
			expect(before).toEqual(schedule);

			const deleted = await stub.kvDelete(CRON_STORAGE_KEY);
			expect(deleted).toBe(true);

			const after = await stub.kvGet(CRON_STORAGE_KEY);
			expect(after).toBeUndefined();
		});

		it("kvDelete returns false for a key that does not exist", async () => {
			const stub = getDeviceStub("cron-storage-test:device-delete-missing");
			const result = await stub.kvDelete(CRON_STORAGE_KEY);
			expect(result).toBe(false);
		});

		it("overwrites an existing cron schedule with new entries", async () => {
			const stub = getDeviceStub("cron-storage-test:device-overwrite");
			const initial = {
				old: { cron: "0 * * * *", nextFireAt: Date.now() + 1_000 },
			};
			const updated = {
				new: { cron: "*/5 * * * *", nextFireAt: Date.now() + 5_000 },
			};

			await stub.kvPut(CRON_STORAGE_KEY, initial);
			await stub.kvPut(CRON_STORAGE_KEY, updated);

			const retrieved = await stub.kvGet<typeof updated>(CRON_STORAGE_KEY);
			expect(retrieved).toEqual(updated);
			expect(retrieved).not.toHaveProperty("old");
		});

		it("stores multiple named schedules in a single object", async () => {
			const stub = getDeviceStub("cron-storage-test:device-multi");
			const now = Date.now();
			const schedules = {
				heartbeat: { cron: "*/5 * * * *", nextFireAt: now + 300_000 },
				dailyReport: { cron: "0 8 * * *", nextFireAt: now + 3_600_000 },
				watchdog: { cron: "*/1 * * * *", nextFireAt: now + 60_000 },
			};

			await stub.kvPut(CRON_STORAGE_KEY, schedules);
			const retrieved = await stub.kvGet<typeof schedules>(CRON_STORAGE_KEY);

			expect(retrieved).toEqual(schedules);
			expect(Object.keys(retrieved ?? {})).toHaveLength(3);
		});
	});

	describe("kv isolation between device instances", () => {
		it("each device DO instance has independent kv storage", async () => {
			const stubA = getDeviceStub("cron-isolation-test:device-a");
			const stubB = getDeviceStub("cron-isolation-test:device-b");

			await stubA.kvPut(CRON_STORAGE_KEY, {
				heartbeat: { cron: "*/5 * * * *", nextFireAt: Date.now() + 300_000 },
			});

			// Device B should not see device A's cron schedules
			const resultB = await stubB.kvGet(CRON_STORAGE_KEY);
			expect(resultB).toBeUndefined();
		});

		it("deleting from one device does not affect another", async () => {
			const stubC = getDeviceStub("cron-isolation-test:device-c");
			const stubD = getDeviceStub("cron-isolation-test:device-d");
			const schedule = {
				test: { cron: "0 * * * *", nextFireAt: Date.now() + 3_600_000 },
			};

			await stubC.kvPut(CRON_STORAGE_KEY, schedule);
			await stubD.kvPut(CRON_STORAGE_KEY, schedule);

			await stubC.kvDelete(CRON_STORAGE_KEY);

			const resultC = await stubC.kvGet(CRON_STORAGE_KEY);
			const resultD = await stubD.kvGet<typeof schedule>(CRON_STORAGE_KEY);

			expect(resultC).toBeUndefined();
			expect(resultD).toEqual(schedule);
		});
	});
});
