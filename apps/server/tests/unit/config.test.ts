import { describe, expect, test } from "bun:test";
import { loadConfig } from "../../src/config";

describe("loadConfig PORT validation", () => {
	test("defaults to 8080 when PORT is unset", () => {
		expect(loadConfig({}).port).toBe(8080);
	});

	test("accepts a valid port", () => {
		expect(loadConfig({ PORT: "3000" }).port).toBe(3000);
		expect(loadConfig({ PORT: "1" }).port).toBe(1);
		expect(loadConfig({ PORT: "65535" }).port).toBe(65535);
	});

	test("rejects non-numeric PORT", () => {
		expect(() => loadConfig({ PORT: "abc" })).toThrow(/Invalid PORT "abc"/);
		expect(() => loadConfig({ PORT: "80a" })).toThrow(/Invalid PORT/);
	});

	test("rejects out-of-range and non-integer PORTs", () => {
		expect(() => loadConfig({ PORT: "0" })).toThrow(/Invalid PORT "0"/);
		expect(() => loadConfig({ PORT: "-1" })).toThrow(/Invalid PORT "-1"/);
		expect(() => loadConfig({ PORT: "70000" })).toThrow(/Invalid PORT "70000"/);
		expect(() => loadConfig({ PORT: "8080.5" })).toThrow(
			/Invalid PORT "8080\.5"/,
		);
	});
});
