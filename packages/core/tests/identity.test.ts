import { describe, expect, test } from "vitest";
import {
	asDeviceId,
	asProjectId,
	DEVICE_ID_REGEX,
	PROJECT_ID_REGEX,
} from "../src/identity";

// The branded-ID helpers mirror the server's slug schema
// (/^[a-z][a-z0-9-]{0,35}$/ - 1..36 chars, lowercase alnum + hyphen, must
// start with a letter). They intentionally reject IDs the server would reject
// (37+ chars, 0 chars, uppercase, digit/underscore starts) and accept every
// length the server accepts (including 1- and 2-char slugs).

describe("PROJECT_ID_REGEX / DEVICE_ID_REGEX boundaries", () => {
	test("accepts every length the server accepts (1..36)", () => {
		expect(PROJECT_ID_REGEX.test("a")).toBe(true);
		expect(PROJECT_ID_REGEX.test("ab")).toBe(true);
		expect(PROJECT_ID_REGEX.test("a-b")).toBe(true);
		expect(PROJECT_ID_REGEX.test("a".repeat(36))).toBe(true);
		expect(DEVICE_ID_REGEX.test("d")).toBe(true);
		expect(DEVICE_ID_REGEX.test("d".repeat(36))).toBe(true);
	});

	test("rejects IDs the server rejects (0 chars, 37+ chars)", () => {
		expect(PROJECT_ID_REGEX.test("")).toBe(false);
		expect(PROJECT_ID_REGEX.test("a".repeat(37))).toBe(false);
		expect(PROJECT_ID_REGEX.test("a".repeat(64))).toBe(false);
		expect(DEVICE_ID_REGEX.test("")).toBe(false);
		expect(DEVICE_ID_REGEX.test("d".repeat(37))).toBe(false);
	});

	test("rejects invalid character sets (uppercase, digit/underscore starts)", () => {
		for (const bad of ["A", "1a", "_a", "a_B", "a.b", "ab c"]) {
			expect(PROJECT_ID_REGEX.test(bad)).toBe(false);
			expect(DEVICE_ID_REGEX.test(bad)).toBe(false);
		}
	});
});

describe("asProjectId / asDeviceId", () => {
	test("brands valid IDs at the 1-char and 36-char boundaries", () => {
		expect(asProjectId("a")).toBe("a");
		expect(asProjectId("a".repeat(36)).length).toBe(36);
		expect(asDeviceId("d")).toBe("d");
		expect(asDeviceId("d".repeat(36)).length).toBe(36);
	});

	test("throws with the documented format on invalid input", () => {
		for (const bad of ["", "a".repeat(37), "Aaa"]) {
			expect(() => asProjectId(bad)).toThrow(/1\.\.36 chars/);
			expect(() => asDeviceId(bad)).toThrow(/1\.\.36 chars/);
		}
	});

	test("rejects non-string input with a TypeError", () => {
		// The validators are typed as (s: string) at the boundary; brand()
		// still guards against non-string runtime input.
		expect(() => asProjectId(null as unknown as string)).toThrow(TypeError);
		expect(() => asDeviceId(undefined as unknown as string)).toThrow(TypeError);
	});
});
