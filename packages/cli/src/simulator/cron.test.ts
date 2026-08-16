import { describe, expect, it } from "vitest";
import { cronMatches, parseCron } from "./cron.js";

describe("parseCron", () => {
	it("parses a valid expression", () => {
		const schedule = parseCron("0 * * * *");
		expect(schedule?.hours).toEqual(
			new Set([
				0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
				20, 21, 22, 23,
			]),
		);
	});

	it("rejects empty list entries like the server parser", () => {
		expect(parseCron("5,,6 * * * *")).toBeNull();
		expect(parseCron("5, * * * *")).toBeNull();
		expect(parseCron("*,/5 * * * *")).toBeNull();
	});

	it("rejects out-of-range and malformed values", () => {
		expect(parseCron("60 * * * *")).toBeNull();
		expect(parseCron("a * * * *")).toBeNull();
		expect(parseCron("1 2 3 4")).toBeNull();
	});

	it("cronMatches is false for invalid expressions instead of throwing", () => {
		expect(cronMatches("5,,6 * * * *", new Date("2026-08-08T10:05:00Z"))).toBe(
			false,
		);
	});
});
