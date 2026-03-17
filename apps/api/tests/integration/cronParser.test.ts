import { describe, expect, it } from "vitest";
import { nextCronTime } from "../../src/durableObjects/lib/cronParser";

// Fixed reference point: 2024-01-01 00:00:00 UTC (a Monday)
const JAN_1_2024 = Date.UTC(2024, 0, 1, 0, 0, 0, 0);

describe("nextCronTime", () => {
	describe("step syntax (*/N)", () => {
		it("every 5 minutes fires at 0, 5, 10, ..., 55", () => {
			const expr = "*/5 * * * *";
			// Start at the very beginning of an hour
			const base = Date.UTC(2024, 0, 1, 6, 0, 0, 0) - 1; // 05:59:59.999
			const fireTimes: number[] = [];
			let t = base;
			for (let i = 0; i < 12; i++) {
				t = nextCronTime(expr, t);
				fireTimes.push(new Date(t).getUTCMinutes());
			}
			expect(fireTimes).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
		});

		it("*/1 fires every minute", () => {
			const next = nextCronTime("*/1 * * * *", JAN_1_2024);
			const d = new Date(next);
			expect(d.getUTCMinutes()).toBe(1);
			expect(d.getUTCSeconds()).toBe(0);
		});
	});

	describe("weekday restriction (dow)", () => {
		it("0 8 * * 1-5 fires on weekdays at 08:00, not Saturday or Sunday", () => {
			const expr = "0 8 * * 1-5";
			let t = JAN_1_2024; // 2024-01-01 is a Monday
			const days: number[] = [];
			for (let i = 0; i < 10; i++) {
				t = nextCronTime(expr, t);
				days.push(new Date(t).getUTCDay()); // 0=Sun, 6=Sat
			}
			// Should only include Mon(1)–Fri(5)
			expect(days.every((d) => d >= 1 && d <= 5)).toBe(true);
			// Should not include Saturday(6) or Sunday(0)
			expect(days.includes(0)).toBe(false);
			expect(days.includes(6)).toBe(false);
		});
	});

	describe("dom/dow OR semantics", () => {
		it("0 8 1 * 1 fires on the 1st of the month OR every Monday", () => {
			const expr = "0 8 1 * 1";
			// Start from 2024-01-01 00:00 UTC (a Monday and also the 1st)
			const fireTimes: Array<{ dom: number; dow: number }> = [];
			let t = JAN_1_2024;
			for (let i = 0; i < 10; i++) {
				t = nextCronTime(expr, t);
				const d = new Date(t);
				fireTimes.push({ dom: d.getUTCDate(), dow: d.getUTCDay() });
			}
			// Every fire time must be either the 1st of the month (dom=1) OR a Monday (dow=1)
			for (const { dom, dow } of fireTimes) {
				expect(dom === 1 || dow === 1).toBe(true);
			}
		});
	});

	describe("leap year handling", () => {
		it("0 0 29 2 * skips to the next leap year when current year is not a leap year", () => {
			// 2023 is not a leap year; 2024 is
			const feb28_2023 = Date.UTC(2023, 1, 28, 12, 0, 0, 0);
			const next = nextCronTime("0 0 29 2 *", feb28_2023);
			const d = new Date(next);
			expect(d.getUTCFullYear()).toBe(2024);
			expect(d.getUTCMonth()).toBe(1); // February (0-indexed)
			expect(d.getUTCDate()).toBe(29);
		});
	});

	describe("sunday normalization", () => {
		it("dow=7 is treated as Sunday (same as dow=0)", () => {
			const expr7 = "0 8 * * 7"; // Sunday using 7
			const expr0 = "0 8 * * 0"; // Sunday using 0
			// Both should fire on the same day
			const next7 = nextCronTime(expr7, JAN_1_2024);
			const next0 = nextCronTime(expr0, JAN_1_2024);
			expect(next7).toBe(next0);
			expect(new Date(next7).getUTCDay()).toBe(0); // 0=Sunday
		});
	});

	describe("range-with-step syntax (N-M/S)", () => {
		it("1-5/2 for minutes fires at 1, 3, 5", () => {
			const expr = "1-5/2 * * * *";
			const base = Date.UTC(2024, 0, 1, 6, 0, 0, 0);
			const fireTimes: number[] = [];
			let t = base;
			for (let i = 0; i < 3; i++) {
				t = nextCronTime(expr, t);
				fireTimes.push(new Date(t).getUTCMinutes());
			}
			expect(fireTimes).toEqual([1, 3, 5]);
		});

		it("0-12/4 for hours fires at 0, 4, 8, 12", () => {
			const expr = "0 0-12/4 * * *";
			const base = Date.UTC(2024, 0, 1, 0, 0, 0, 0) - 1;
			const fireTimes: number[] = [];
			let t = base;
			for (let i = 0; i < 4; i++) {
				t = nextCronTime(expr, t);
				fireTimes.push(new Date(t).getUTCHours());
			}
			expect(fireTimes).toEqual([0, 4, 8, 12]);
		});
	});

	describe("error cases", () => {
		it("throws for step of 0", () => {
			expect(() => nextCronTime("*/0 * * * *", JAN_1_2024)).toThrow();
		});

		it("throws for 6 fields", () => {
			expect(() => nextCronTime("* * * * * *", JAN_1_2024)).toThrow(/5 fields/);
		});

		it("throws for 4 fields (too few)", () => {
			expect(() => nextCronTime("* * * *", JAN_1_2024)).toThrow(/5 fields/);
		});

		it("throws for hour value out of range", () => {
			expect(() => nextCronTime("0 25 * * *", JAN_1_2024)).toThrow();
		});

		it("throws for invalid (non-numeric) field value", () => {
			expect(() => nextCronTime("abc * * * *", JAN_1_2024)).toThrow();
		});

		it("throws for impossible date (Feb 30) that never occurs", () => {
			// February never has a 30th — the parser should throw after 1 year
			expect(() => nextCronTime("0 0 30 2 *", JAN_1_2024)).toThrow(
				/No valid fire time/,
			);
		});
	});

	describe("specific fire time accuracy", () => {
		it("returns the exact next minute boundary after `after`", () => {
			// If current time is exactly 08:00:00 UTC, next fire should be the NEXT occurrence
			const exactly8am = Date.UTC(2024, 0, 1, 8, 0, 0, 0);
			const next = nextCronTime("0 8 * * *", exactly8am);
			// Should be 08:00 the following day
			const d = new Date(next);
			expect(d.getUTCDate()).toBe(2); // Jan 2
			expect(d.getUTCHours()).toBe(8);
			expect(d.getUTCMinutes()).toBe(0);
		});

		it("comma-separated values fire at each listed minute", () => {
			const expr = "0,30 * * * *";
			const base = Date.UTC(2024, 0, 1, 6, 0, 0, 0) - 1;
			const next1 = nextCronTime(expr, base);
			const next2 = nextCronTime(expr, next1);
			expect(new Date(next1).getUTCMinutes()).toBe(0);
			expect(new Date(next2).getUTCMinutes()).toBe(30);
		});

		it("range syntax N-M includes all values from N to M", () => {
			const expr = "0 9-11 * * *"; // fires at 09:00, 10:00, 11:00
			let t = Date.UTC(2024, 0, 1, 8, 59, 0, 0);
			const hours: number[] = [];
			for (let i = 0; i < 3; i++) {
				t = nextCronTime(expr, t);
				hours.push(new Date(t).getUTCHours());
			}
			expect(hours).toEqual([9, 10, 11]);
		});
	});
});
