/**
 * Integration tests for the BaseDevice cron schedule storage and kv guard.
 *
 * These tests cover:
 * 1. The `__internal:` key prefix guard in kvPut/kvGet/kvDelete — user code
 *    cannot read or corrupt internal scheduler state.
 * 2. Normal user kv operations continue to work correctly.
 * 3. kv storage isolation between device instances.
 *
 * Note: Full end-to-end tests of alarm dispatch (alarm() → onCron() being
 * called inside a user script) require the LOADER worker binding to dynamically
 * instantiate user scripts, which is not available in the unit test environment.
 * Those flows are covered by E2E / manual tests.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CRON_STORAGE_KEY } from "../../src/durableObjects/lib/device";

function getDeviceStub(name: string) {
	const id = env.DEVICE.idFromName(name);
	return env.DEVICE.get(id);
}

describe.sequential("BaseDevice — kv guard for internal keys", () => {
	it("CRON_STORAGE_KEY uses the __internal: prefix", () => {
		expect(CRON_STORAGE_KEY.startsWith("__internal:")).toBe(true);
	});

	it("kvPut rejects __internal: keys with an error", async () => {
		const stub = getDeviceStub("kv-guard-test:device-1");
		await expect(stub.kvPut(CRON_STORAGE_KEY, { foo: "bar" })).rejects.toThrow(
			/reserved for internal use/i,
		);
	});

	it("kvGet for __internal: key returns undefined (no data leakage)", async () => {
		const stub = getDeviceStub("kv-guard-test:device-2");
		const result = await stub.kvGet(CRON_STORAGE_KEY);
		expect(result).toBeUndefined();
	});

	it("kvDelete for __internal: key returns false (no-op)", async () => {
		const stub = getDeviceStub("kv-guard-test:device-3");
		const result = await stub.kvDelete(CRON_STORAGE_KEY);
		expect(result).toBe(false);
	});

	it("arbitrary __internal: prefixed keys are also blocked", async () => {
		const stub = getDeviceStub("kv-guard-test:device-4");
		await expect(stub.kvPut("__internal:anything", "value")).rejects.toThrow();
		expect(await stub.kvGet("__internal:anything")).toBeUndefined();
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
