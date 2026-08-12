import { describe, expect, test } from "bun:test";
import {
	compareFirmwareVersions,
	firmwareSupportsCommand,
} from "./firmwareCapabilities";

describe("compareFirmwareVersions", () => {
	test("equal versions compare 0", () => {
		expect(compareFirmwareVersions("0.2.0", "0.2.0")).toBe(0);
		expect(compareFirmwareVersions("1.0.0", "1.0.0")).toBe(0);
	});

	test("newer version compares 1", () => {
		expect(compareFirmwareVersions("0.3.0", "0.2.0")).toBe(1);
		expect(compareFirmwareVersions("1.0.0", "0.9.9")).toBe(1);
		expect(compareFirmwareVersions("0.2.1", "0.2.0")).toBe(1);
	});

	test("older version compares -1", () => {
		expect(compareFirmwareVersions("0.1.0", "0.2.0")).toBe(-1);
		expect(compareFirmwareVersions("0.2.0", "0.2.1")).toBe(-1);
	});

	test("missing parts are treated as 0", () => {
		expect(compareFirmwareVersions("0.2", "0.2.0")).toBe(0);
		expect(compareFirmwareVersions("1", "1.0.0")).toBe(0);
	});

	test("prerelease and build suffixes are ignored", () => {
		expect(compareFirmwareVersions("0.2.0-rc.1", "0.2.0")).toBe(0);
		expect(compareFirmwareVersions("0.2.0+build5", "0.2.0")).toBe(0);
		expect(compareFirmwareVersions("0.2.0-rc.1", "0.2.0+build5")).toBe(0);
	});

	test("non-numeric versions compare null", () => {
		expect(compareFirmwareVersions("0.2.0", "abc")).toBeNull();
		expect(compareFirmwareVersions("0.2.a", "0.2.0")).toBeNull();
		expect(compareFirmwareVersions("", "0.2.0")).toBeNull();
	});
});

describe("firmwareSupportsCommand", () => {
	test("unknown device type or firmware version returns null (allow)", () => {
		expect(firmwareSupportsCommand(null, "0.2.0", "dht_read")).toBeNull();
		expect(firmwareSupportsCommand("esp32c3", null, "dht_read")).toBeNull();
		expect(firmwareSupportsCommand(null, null, "dht_read")).toBeNull();
	});

	test("commands without a recorded minimum are always supported", () => {
		expect(firmwareSupportsCommand("esp32c3", "0.1.0", "get_temperature")).toBe(
			true,
		);
		expect(firmwareSupportsCommand("pico-w", "0.1.0", "reboot")).toBe(true);
	});

	test("unknown device type with a known version is allowed (no minimum recorded)", () => {
		expect(firmwareSupportsCommand("unknown-board", "0.2.0", "dht_read")).toBe(
			true,
		);
	});

	test("an unparseable firmware version returns null (allow)", () => {
		expect(firmwareSupportsCommand("esp32c3", "latest", "dht_read")).toBeNull();
	});

	test("old firmware is rejected for the sensor commands", () => {
		expect(firmwareSupportsCommand("esp32c3", "0.1.0", "dht_read")).toBe(false);
		expect(firmwareSupportsCommand("pico-w", "0.1.9", "onewire_search")).toBe(
			false,
		);
		expect(firmwareSupportsCommand("esp32", "0.1.0", "onewire_read_temp")).toBe(
			false,
		);
	});

	test("the minimum version itself and newer versions pass", () => {
		expect(firmwareSupportsCommand("esp32c3", "0.2.0", "dht_read")).toBe(true);
		expect(firmwareSupportsCommand("pico-w", "0.2.0", "onewire_search")).toBe(
			true,
		);
		expect(firmwareSupportsCommand("esp32", "0.3.0", "onewire_read_temp")).toBe(
			true,
		);
	});
});
